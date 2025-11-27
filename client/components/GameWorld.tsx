import { useEffect, useRef, useState } from 'react'
import { Player, Position, GAME_CONFIG, VOICE_ROOMS, PlayerUpdate, VoiceRoomUpdate } from '@/types/game'
import { useGameStore } from '@/store/gameStore'
import ConnectionManager from '../services/ConnectionManager'

const connectionManager = ConnectionManager.getInstance()

interface GameWorldProps {
  fetchOnlineUsers: () => Promise<void>
}

export default function GameWorld({ fetchOnlineUsers }: GameWorldProps) {
  // 从 store 获取状态
  const myPlayer = useGameStore((state) => state.myPlayer)
  const otherPlayers = useGameStore((state) => state.otherPlayers)
  const currentVoiceRoom = useGameStore((state) => state.currentVoiceRoom)
  const playersInRooms = useGameStore((state) => state.playersInRooms)
  const updateMyPlayerPosition = useGameStore((state) => state.updateMyPlayerPosition)
  const setCurrentVoiceRoom = useGameStore((state) => state.setCurrentVoiceRoom)
  const addPlayerToRoom = useGameStore((state) => state.addPlayerToRoom)
  const removePlayerFromRoom = useGameStore((state) => state.removePlayerFromRoom)
  const setOtherPlayer = useGameStore((state) => state.setOtherPlayer)
  const removeOtherPlayer = useGameStore((state) => state.removeOtherPlayer)

  // Hooks 必须在条件语句之前调用
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()
  const keysPressed = useRef<Set<string>>(new Set())
  const [fps, setFps] = useState(0)
  const lastFrameTime = useRef(Date.now())
  const frameCount = useRef(0)

  // 玩家位置状态
  const playerPosition = useRef<Position>(myPlayer?.position || { x: 400, y: 300 })
  const playerVelocity = useRef({ x: 0, y: 0 })

  // 如果没有玩家数据，不渲染
  if (!myPlayer) return null

  // 检测玩家是否在语音室内
  const checkVoiceRoom = (position: Position): string | null => {
    for (const room of VOICE_ROOMS) {
      if (
        position.x >= room.x &&
        position.x <= room.x + room.width &&
        position.y >= room.y &&
        position.y <= room.y + room.height
      ) {
        return room.id
      }
    }
    return null
  }

  // 处理游戏更新
  const handleGameUpdate = (update: PlayerUpdate, fromPeerId: string) => {
    console.log('🎮 收到游戏更新:', update.type, 'from', fromPeerId)
    switch (update.type) {
      case 'join':
        if (update.username && update.character && update.position) {
          const newPlayer: Player = {
            peerId: fromPeerId,
            username: update.username,
            character: update.character,
            position: update.position,
            velocity: { x: 0, y: 0 },
            lastUpdate: Date.now()
          }
          setOtherPlayer(fromPeerId, newPlayer)
          const currentOtherPlayers = useGameStore.getState().otherPlayers
          console.log('🎮 玩家加入:', update.username, '当前其他玩家数:', currentOtherPlayers.size)
        } else {
          console.log('⚠️ join 消息缺少必要字段:', update)
        }
        break

      case 'position':
        if (update.position) {
          // 使用 getState() 获取最新的状态
          const currentOtherPlayers = useGameStore.getState().otherPlayers
          const player = currentOtherPlayers.get(fromPeerId)
          if (player) {
            const updated = {
              ...player,
              position: update.position!,
              velocity: update.velocity || { x: 0, y: 0 },
              lastUpdate: Date.now()
            }
            setOtherPlayer(fromPeerId, updated)
          }
        }
        break

      case 'leave':
        removeOtherPlayer(fromPeerId)
        console.log('🎮 玩家离开:', fromPeerId)
        break
    }
  }

  // 订阅游戏数据更新和玩家移除事件，并管理连接
  useEffect(() => {
    console.log('🎮 GameWorld 挂载 - 开始管理连接, myPlayer:', myPlayer?.username)
    const unsubscribeData = connectionManager.onData((data, fromPeerId) => {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data

        // 只处理游戏更新消息
        if (parsed.type && (parsed.type === 'join' || parsed.type === 'position' || parsed.type === 'leave')) {
          handleGameUpdate(parsed as PlayerUpdate, fromPeerId)
        }
      } catch (error) {
        console.error('处理游戏数据失败:', error)
      }
    })

    const unsubscribePlayerRemoved = connectionManager.onPlayerRemoved((peerId) => {
      removeOtherPlayer(peerId)
      console.log('🎮 玩家断开连接:', peerId)
    })

    // 立即获取在线用户并建立连接
    setTimeout(fetchOnlineUsers, 500)

    // 定期刷新用户列表并建立新连接
    const userListInterval = setInterval(fetchOnlineUsers, 3000)

    return () => {
      console.log('🎮 GameWorld 卸载 - 停止连接管理')
      unsubscribeData()
      unsubscribePlayerRemoved()
      clearInterval(userListInterval)
    }
  }, [])

  // 键盘控制
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault()
        keysPressed.current.add(key)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      keysPressed.current.delete(key)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // 更新玩家速度
  const updateVelocity = () => {
    let vx = 0
    let vy = 0

    if (keysPressed.current.has('w') || keysPressed.current.has('arrowup')) vy -= 1
    if (keysPressed.current.has('s') || keysPressed.current.has('arrowdown')) vy += 1
    if (keysPressed.current.has('a') || keysPressed.current.has('arrowleft')) vx -= 1
    if (keysPressed.current.has('d') || keysPressed.current.has('arrowright')) vx += 1

    // 归一化对角线移动
    if (vx !== 0 && vy !== 0) {
      const length = Math.sqrt(vx * vx + vy * vy)
      vx = (vx / length) * GAME_CONFIG.PLAYER_SPEED
      vy = (vy / length) * GAME_CONFIG.PLAYER_SPEED
    } else {
      vx *= GAME_CONFIG.PLAYER_SPEED
      vy *= GAME_CONFIG.PLAYER_SPEED
    }

    playerVelocity.current = { x: vx, y: vy }
  }

  // 广播游戏更新
  const broadcastGameUpdate = (update: PlayerUpdate) => {
    const message = JSON.stringify(update)
    connectionManager.broadcast(message)
  }

  // 广播语音更新
  const broadcastVoiceUpdate = (update: VoiceRoomUpdate) => {
    const message = JSON.stringify(update)
    connectionManager.broadcast(message)
  }

  // 处理语音室变化
  const handleVoiceRoomChange = async (newRoomId: string | null) => {
    const oldRoomId = currentVoiceRoom

    if (oldRoomId === newRoomId) return

    console.log('🚪 语音室变化:', oldRoomId, '->', newRoomId)

    const myPeerId = connectionManager.getPeerId()

    // 离开旧房间
    if (oldRoomId) {
      // 从房间中移除自己
      removePlayerFromRoom(oldRoomId, myPeerId)

      const leaveUpdate: VoiceRoomUpdate = {
        type: 'voice-leave',
        peerId: myPeerId,
        roomId: oldRoomId,
        timestamp: Date.now()
      }
      broadcastVoiceUpdate(leaveUpdate)
    }

    // 更新当前语音室（VoicePanel 会监听这个变化并处理语音逻辑）
    setCurrentVoiceRoom(newRoomId)

    // 加入新房间
    if (newRoomId) {
      // 添加自己到房间
      addPlayerToRoom(newRoomId, myPeerId)

      const joinUpdate: VoiceRoomUpdate = {
        type: 'voice-join',
        peerId: myPeerId,
        roomId: newRoomId,
        timestamp: Date.now()
      }
      broadcastVoiceUpdate(joinUpdate)
    }
  }

  // 更新玩家位置
  const updatePosition = () => {
    updateVelocity()

    const newX = playerPosition.current.x + playerVelocity.current.x
    const newY = playerPosition.current.y + playerVelocity.current.y

    // 边界检测
    const halfSize = GAME_CONFIG.PLAYER_SIZE / 2
    const clampedX = Math.max(halfSize, Math.min(GAME_CONFIG.CANVAS_WIDTH - halfSize, newX))
    const clampedY = Math.max(halfSize, Math.min(GAME_CONFIG.CANVAS_HEIGHT - halfSize, newY))

    playerPosition.current = { x: clampedX, y: clampedY }

    // 检测语音室变化
    const newRoom = checkVoiceRoom(playerPosition.current)
    if (newRoom !== currentVoiceRoom) {
      handleVoiceRoomChange(newRoom)
    }

    // 如果位置或速度有变化，更新 store 并广播
    if (playerVelocity.current.x !== 0 || playerVelocity.current.y !== 0) {
      // 更新本地状态
      updateMyPlayerPosition(playerPosition.current, playerVelocity.current)

      // 广播位置更新
      const update: PlayerUpdate = {
        type: 'position',
        peerId: connectionManager.getPeerId(),
        position: playerPosition.current,
        velocity: playerVelocity.current,
        timestamp: Date.now()
      }
      broadcastGameUpdate(update)
    }
  }

  // 绘制玩家
  const drawPlayer = (ctx: CanvasRenderingContext2D, player: Player, isMe: boolean) => {
    const { x, y } = player.position
    const size = GAME_CONFIG.PLAYER_SIZE

    // 绘制阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 5

    // 绘制角色圆形
    ctx.fillStyle = player.character.color
    ctx.beginPath()
    ctx.arc(x, y, size / 2, 0, Math.PI * 2)
    ctx.fill()

    // 绘制边框（自己是金色，其他玩家是白色）
    ctx.strokeStyle = isMe ? '#fbbf24' : '#ffffff'
    ctx.lineWidth = isMe ? 3 : 2
    ctx.stroke()

    ctx.shadowColor = 'transparent'

    // 绘制表情符号
    if (player.character.emoji) {
      ctx.font = `${size * 0.6}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(player.character.emoji, x, y)
    }

    // 绘制用户名
    ctx.font = '12px Arial'
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 3
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.strokeText(player.username, x, y + size / 2 + 5)
    ctx.fillText(player.username, x, y + size / 2 + 5)

    // 如果是自己，显示角色名称
    if (isMe) {
      ctx.font = 'bold 10px Arial'
      ctx.fillStyle = '#fbbf24'
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 2
      ctx.strokeText(player.character.name, x, y - size / 2 - 15)
      ctx.fillText(player.character.name, x, y - size / 2 - 15)
    }
  }

  // 绘制语音室
  const drawVoiceRooms = (ctx: CanvasRenderingContext2D) => {
    VOICE_ROOMS.forEach(room => {
      // 绘制房间背景
      ctx.fillStyle = room.color
      ctx.fillRect(room.x, room.y, room.width, room.height)

      // 绘制房间边框
      ctx.strokeStyle = room.borderColor
      ctx.lineWidth = currentVoiceRoom === room.id ? 4 : 2
      ctx.strokeRect(room.x, room.y, room.width, room.height)

      // 绘制房间名称
      ctx.fillStyle = room.borderColor
      ctx.font = 'bold 16px Arial'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(room.name, room.x + room.width / 2, room.y + 10)

      // 显示房间内的玩家数量
      const playersInRoom = playersInRooms.get(room.id)
      const playerCount = playersInRoom ? playersInRoom.size : 0
      if (playerCount > 0) {
        ctx.font = '14px Arial'
        ctx.fillText(`👥 ${playerCount} 人`, room.x + room.width / 2, room.y + 35)
      }
    })
  }

  // 绘制网格背景
  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    const gridSize = GAME_CONFIG.MAP_GRID_SIZE
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1

    // 垂直线
    for (let x = 0; x <= GAME_CONFIG.CANVAS_WIDTH; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, GAME_CONFIG.CANVAS_HEIGHT)
      ctx.stroke()
    }

    // 水平线
    for (let y = 0; y <= GAME_CONFIG.CANVAS_HEIGHT; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(GAME_CONFIG.CANVAS_WIDTH, y)
      ctx.stroke()
    }
  }

  // 主渲染循环
  const render = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 清空画布
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(0, 0, GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT)

    // 绘制网格
    drawGrid(ctx)

    // 绘制语音室
    drawVoiceRooms(ctx)

    // 更新并绘制自己的玩家
    updatePosition()
    const currentPlayer = { ...myPlayer, position: playerPosition.current }
    drawPlayer(ctx, currentPlayer, true)

    // 绘制其他玩家
    otherPlayers.forEach((player) => {
      drawPlayer(ctx, player, false)
    })

    // 绘制信息面板
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
    ctx.fillRect(10, 10, 200, 80)
    ctx.fillStyle = '#ffffff'
    ctx.font = '12px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`FPS: ${fps}`, 20, 30)
    ctx.fillText(`在线玩家: ${otherPlayers.size + 1}`, 20, 50)
    ctx.fillText(`位置: (${Math.round(playerPosition.current.x)}, ${Math.round(playerPosition.current.y)})`, 20, 70)

    // 计算FPS
    frameCount.current++
    const now = Date.now()
    if (now - lastFrameTime.current >= 1000) {
      setFps(frameCount.current)
      frameCount.current = 0
      lastFrameTime.current = now
    }

    animationFrameRef.current = requestAnimationFrame(render)
  }

  // 启动渲染循环
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(render)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [myPlayer, otherPlayers])

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <canvas
        ref={canvasRef}
        width={GAME_CONFIG.CANVAS_WIDTH}
        height={GAME_CONFIG.CANVAS_HEIGHT}
        style={{
          border: '2px solid #3b82f6',
          borderRadius: '8px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          backgroundColor: '#ffffff'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '20px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}
      >
        使用 WASD 或方向键移动
      </div>
    </div>
  )
}

