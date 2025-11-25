import { useEffect, useRef, useState } from 'react'
import { Player, Position, GAME_CONFIG } from '../types/game'

interface GameWorldProps {
  myPlayer: Player
  otherPlayers: Map<string, Player>
  onPositionUpdate: (position: Position, velocity: { x: number; y: number }) => void
}

export default function GameWorld({ myPlayer, otherPlayers, onPositionUpdate }: GameWorldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>()
  const keysPressed = useRef<Set<string>>(new Set())
  const [fps, setFps] = useState(0)
  const lastFrameTime = useRef(Date.now())
  const frameCount = useRef(0)

  // 玩家位置状态
  const playerPosition = useRef<Position>(myPlayer.position)
  const playerVelocity = useRef({ x: 0, y: 0 })

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

    // 如果位置或速度有变化，通知父组件
    if (playerVelocity.current.x !== 0 || playerVelocity.current.y !== 0) {
      onPositionUpdate(playerPosition.current, playerVelocity.current)
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

