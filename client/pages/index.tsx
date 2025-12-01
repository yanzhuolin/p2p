import {useEffect, useRef, useState} from 'react'
import {DataConnection} from 'peerjs'
import GameWorld from '../components/GameWorld'
import CharacterSelect from '../components/CharacterSelect'
import ChatPanel from '../components/ChatPanel'
import VoicePanel from '../components/VoicePanel'
import {Character, CHARACTERS, GAME_CONFIG, Player, PlayerUpdate, VoiceRoomUpdate} from '@/types/game'
import {useChatStore} from '@/store/chatStore'
import {useGameStore} from '@/store/gameStore'
import ConnectionManager from '@/services/ConnectionManager'
import styles from '../styles/Game.module.css'

interface OnlineUser {
  peerId: string
  username: string
}

// 从环境变量读取配置，支持 localhost 和 IP 访问
// 优先使用浏览器当前访问的主机名，避免证书不匹配问题
const SERVER_HOST = process.env.NEXT_PUBLIC_SERVER_HOST || 'localhost'

const SERVER_API_PORT = parseInt(process.env.NEXT_PUBLIC_SERVER_API_PORT || '3001', 10)
const SIGNALING_PORT = parseInt(process.env.NEXT_PUBLIC_SERVER_SIGNALING_PORT || '9000', 10)
const PEER_PATH = process.env.NEXT_PUBLIC_SERVER_SIGNALING_PEER_PATH || '/myapp'

/**
 * 根据浏览器当前协议自动选择对应的 API 协议
 * - 如果浏览器使用 https，则 API 使用 https
 * - 如果浏览器使用 http，则 API 使用 http
 */
const getApiServerUrl = () => {
  if (typeof window === 'undefined') {
    return `http://localhost:${SERVER_API_PORT}`
  }

  const protocol = window.location.protocol // 'http:' 或 'https:'
  const hostname = window.location.hostname
  return `${protocol}//${hostname}:${SERVER_API_PORT}`
}

/**
 * 检测是否使用安全协议（HTTPS）
 * - 用于 PeerJS 的 secure 参数
 * - https 使用 wss（WebSocket Secure）
 * - http 使用 ws（WebSocket）
 */
const isSecureProtocol = () => {
  if (typeof window === 'undefined') {
    return false
  }
  return window.location.protocol === 'https:'
}

// API 服务器地址（动态获取）
const API_SERVER = getApiServerUrl()

const STORAGE_KEYS = {
  USERNAME: 'p2p-game-username',
  CHARACTER: 'p2p-game-character'
}

export default function Home() {
  // 连接管理单例
  const connectionManager = useRef(ConnectionManager.getInstance()).current

  // 基础状态
  const [username, setUsername] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  // 游戏状态
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [showCharacterSelect, setShowCharacterSelect] = useState(false)

  // 从 gameStore 获取状态和 actions
  const myPlayer = useGameStore((state) => state.myPlayer)
  const setMyPlayer = useGameStore((state) => state.setMyPlayer)
  const currentVoiceRoom = useGameStore((state) => state.currentVoiceRoom)

  // 聊天状态
  const clearMessages = useChatStore((state) => state.clearMessages)
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [connections, setConnections] = useState<Map<string, DataConnection>>(new Map())

  // Refs
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const myPlayerRef = useRef<Player | null>(null)
  const currentVoiceRoomRef = useRef<string | null>(null)


  // 初始化时从 localStorage 加载用户名和角色
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedUsername = localStorage.getItem(STORAGE_KEYS.USERNAME)
      const savedCharacterStr = localStorage.getItem(STORAGE_KEYS.CHARACTER)

      if (savedUsername) {
        setUsername(savedUsername)
      }

      if (savedCharacterStr) {
        try {
          const savedCharacter = JSON.parse(savedCharacterStr)
          const validCharacter = CHARACTERS.find(c => c.id === savedCharacter.id)
          if (validCharacter) {
            setSelectedCharacter(validCharacter)
          }
        } catch (e) {
          console.error('加载角色失败:', e)
        }
      }
    }
  }, [])

  // 订阅连接管理器的变化
  useEffect(() => {
    const unsubscribeConnections = connectionManager.onConnectionChange((newConnections) => {
      setConnections(newConnections)
    })

    // 数据处理由各个组件自己订阅：
    // - GameWorld 处理游戏更新 (join, position, leave)
    // - VoicePanel 处理语音更新 (voice-join, voice-leave)
    // - ChatPanel 处理聊天消息 (chat)

    return () => {
      unsubscribeConnections()
    }
  }, [connectionManager])

  // 同步 myPlayer 和 currentVoiceRoom 到 ref
  useEffect(() => {
    myPlayerRef.current = myPlayer
    currentVoiceRoomRef.current = currentVoiceRoom
  }, [myPlayer, currentVoiceRoom])

  // 页面刷新/关闭时清理
  useEffect(() => {
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      const currentPeerId = connectionManager.getPeerId()
      if (currentPeerId) {
        // 如果在语音室中，广播离开消息
        const voiceRoom = useGameStore.getState().currentVoiceRoom
        if (voiceRoom) {
          const leaveUpdate: VoiceRoomUpdate = {
            type: 'voice-leave',
            peerId: currentPeerId,
            roomId: voiceRoom,
            timestamp: Date.now()
          }
          const message = JSON.stringify(leaveUpdate)
          connectionManager.broadcast(message)
        }

        // 广播玩家离开游戏的消息
        const leaveGameUpdate: PlayerUpdate = {
          type: 'leave',
          peerId: currentPeerId,
          timestamp: Date.now()
        }
        connectionManager.broadcast(JSON.stringify(leaveGameUpdate))

        // 注销 peerId
        const data = JSON.stringify({peerId: currentPeerId})
        navigator.sendBeacon(`${API_SERVER}/api/unregister`, new Blob([data], {type: 'application/json'}))
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [connectionManager])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 清理定时器
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
      }

      // 关闭所有连接
      // 注意：离开消息的广播由 beforeunload 处理，这里不重复广播
      connectionManager.closeAllConnections()
    }
  }, [connectionManager])


  // 广播游戏状态更新
  const broadcastGameUpdate = (update: PlayerUpdate) => {
    const message = JSON.stringify(update)
    connectionManager.broadcast(message)
  }


  // 处理角色选择
  const handleCharacterSelect = (character: Character) => {
    setSelectedCharacter(character)
    setShowCharacterSelect(false)

    // 保存角色到 localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.CHARACTER, JSON.stringify(character))
    }

    // 如果已经有玩家对象，保持当前位置；否则使用默认位置
    const currentPosition = myPlayer?.position || {
      x: GAME_CONFIG.CANVAS_WIDTH / 2,
      y: GAME_CONFIG.CANVAS_HEIGHT / 2
    }

    // 创建玩家对象
    const player: Player = {
      peerId: connectionManager.getPeerId(),
      username,
      character,
      position: currentPosition,
      velocity: {x: 0, y: 0},
      lastUpdate: Date.now()
    }
    setMyPlayer(player)
    myPlayerRef.current = player

    // 广播加入游戏（重新选择角色时也广播，让其他玩家看到新角色）
    const update: PlayerUpdate = {
      type: 'join',
      peerId: player.peerId,
      username: player.username,
      character: player.character,
      position: player.position,
      timestamp: Date.now()
    }
    broadcastGameUpdate(update)
  }

  // 获取在线用户列表
  const fetchOnlineUsers = async () => {
    const peer = connectionManager.getPeer()
    if (!peer || peer.destroyed) {
      return
    }

    const currentPeerId = connectionManager.getPeerId()

    try {
      const response = await fetch(`${API_SERVER}/api/users`, {
        signal: AbortSignal.timeout(5000)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()

      const users = data.users.filter((u: OnlineUser) => u.peerId !== currentPeerId)
      setOnlineUsers(users)

      users.forEach((user: OnlineUser) => {
        if (!connectionManager.hasConnection(user.peerId)) {
          setTimeout(() => connectToPeer(user.peerId), Math.random() * 1000)
        }
      })
    } catch (error: any) {
      if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
        console.error('⚠️ 获取在线用户失败:', error.message)
      }
    }
  }

  // 连接到其他用户
  const connectToPeer = (peerId: string) => {
    connectionManager.connectToPeer(peerId, (connectedPeerId) => {
      // 如果已经选择了角色，发送加入消息
      if (myPlayerRef.current) {
        const conn = connectionManager.getConnection(connectedPeerId)
        if (conn) {
          // 发送玩家加入消息（包含当前位置）
          const update: PlayerUpdate = {
            type: 'join',
            peerId: myPlayerRef.current.peerId,
            username: myPlayerRef.current.username,
            character: myPlayerRef.current.character,
            position: myPlayerRef.current.position,
            timestamp: Date.now()
          }
          console.log('📤 connectToPeer 发送玩家状态给:', connectedPeerId, update)
          conn.send(JSON.stringify(update))

          // 如果在语音室中，发送语音室加入消息
          if (currentVoiceRoomRef.current) {
            const voiceUpdate: VoiceRoomUpdate = {
              type: 'voice-join',
              peerId: myPlayerRef.current.peerId,
              roomId: currentVoiceRoomRef.current,
              timestamp: Date.now()
            }
            console.log('📤 connectToPeer 发送语音室状态给:', connectedPeerId, voiceUpdate)
            conn.send(JSON.stringify(voiceUpdate))
          } else {
            console.log('⚠️ connectToPeer: 不在语音室中，不发送语音室信息')
          }
        }
      } else {
        console.log('⚠️ 连接建立但还没有选择角色')
      }
    })
  }


  // 连接到服务器
  const connect = async () => {
    if (!username.trim()) {
      alert('请输入用户名')
      return
    }

    // 保存用户名到 localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.USERNAME, username)
    }

    connectionManager.initializePeer(
      {
        host: SERVER_HOST,
        port: SIGNALING_PORT,
        path: PEER_PATH,
        secure: isSecureProtocol(), // 根据浏览器协议自动选择 HTTP/HTTPS
        debug: 2,
        apiServerUrl: API_SERVER,
        heartbeatInterval: 10000,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
          ]
        }
      },
      {
        onOpen: async (id) => {
          console.log('✅ 我的Peer ID:', id)
          setIsConnected(true)

          // 注册到API服务器
          try {
            const response = await fetch(`${API_SERVER}/api/register`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({peerId: id, username})
            })
            const data = await response.json()
            if (data.success) {
              console.log('✅ 已注册到服务器')
            }
          } catch (error) {
            console.error('注册失败:', error)
          }

          // 注意：连接和定时器的管理移到 GameWorld 组件中

          // 如果已经有选中的角色，自动创建玩家；否则显示角色选择
          if (selectedCharacter) {
            const player: Player = {
              peerId: id,
              username,
              character: selectedCharacter,
              position: {
                x: GAME_CONFIG.CANVAS_WIDTH / 2,
                y: GAME_CONFIG.CANVAS_HEIGHT / 2
              },
              velocity: {x: 0, y: 0},
              lastUpdate: Date.now()
            }
            setMyPlayer(player)
            myPlayerRef.current = player

            // 广播加入游戏
            const update: PlayerUpdate = {
              type: 'join',
              peerId: player.peerId,
              username: player.username,
              character: player.character,
              position: player.position,
              timestamp: Date.now()
            }
            broadcastGameUpdate(update)
          } else {
            setShowCharacterSelect(true)
          }
        },
        // onCall 回调由 ConnectionManager 和 VoicePanel 处理
        onConnection: (conn) => {
          console.log('🔗 收到新连接:', conn.peer, 'myPlayer:', myPlayerRef.current?.username, 'voiceRoom:', currentVoiceRoomRef.current)
          if (myPlayerRef.current) {
            // 发送玩家加入消息（包含当前位置）
            const update: PlayerUpdate = {
              type: 'join',
              peerId: myPlayerRef.current.peerId,
              username: myPlayerRef.current.username,
              character: myPlayerRef.current.character,
              position: myPlayerRef.current.position,
              timestamp: Date.now()
            }
            console.log('📤 onConnection 发送玩家状态给:', conn.peer, update)
            conn.send(JSON.stringify(update))

            // 如果在语音室中，发送语音室加入消息
            if (currentVoiceRoomRef.current) {
              const voiceUpdate: VoiceRoomUpdate = {
                type: 'voice-join',
                peerId: myPlayerRef.current.peerId,
                roomId: currentVoiceRoomRef.current,
                timestamp: Date.now()
              }
              console.log('📤 onConnection 发送语音室状态给:', conn.peer, voiceUpdate)
              conn.send(JSON.stringify(voiceUpdate))
            } else {
              console.log('⚠️ onConnection: 不在语音室中，不发送语音室信息')
            }
          } else {
            console.log('⚠️ onConnection 触发但 myPlayerRef.current 为空')
          }
        },
        onError: (err) => {
          console.error('Peer错误:', err)
          const errorType = (err as any).type
          if (errorType === 'peer-unavailable') {
            console.log('对方不在线')
          } else {
            alert(`连接错误: ${err.message}`)
          }
        }
      }
    )
  }

  // 断开连接（只需要修改用户名，不需要重新选择角色）
  const disconnect = async () => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current)
      syncIntervalRef.current = null
    }

    const voiceRoom = useGameStore.getState().currentVoiceRoom
    if (voiceRoom) {
      const leaveUpdate: VoiceRoomUpdate = {
        type: 'voice-leave',
        peerId: connectionManager.getPeerId(),
        roomId: voiceRoom,
        timestamp: Date.now()
      }
      const message = JSON.stringify(leaveUpdate)
      connectionManager.broadcast(message)
    }
    // 广播离开消息
    const leaveUpdate: PlayerUpdate = {
      type: 'leave',
      peerId: connectionManager.getPeerId(),
      timestamp: Date.now()
    }
    broadcastGameUpdate(leaveUpdate)

    // 语音资源由 VoicePanel 和 ConnectionManager 管理，会自动清理

    const currentPeerId = connectionManager.getPeerId()
    if (currentPeerId) {
      try {
        await fetch(`${API_SERVER}/api/unregister`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({peerId: currentPeerId})
        })
      } catch (error) {
        console.error('注销失败:', error)
      }
    }

    connectionManager.destroy()

    setIsConnected(false)
    clearMessages()
    setOnlineUsers([])
    myPlayerRef.current = null
    // 不清除 selectedCharacter，保留角色选择
    // setSelectedCharacter(null)
    useGameStore.getState().reset()

    console.log('✅ 已完全断开连接')
  }

  // 渲染登录界面
  if (!isConnected) {
    return (
      <div className={styles.loginContainer}>
        <div className={styles.loginBox}>
          <h1 className={styles.loginTitle}>🎮 P2P 游戏世界</h1>
          <p className={styles.loginSubtitle}>进入多人在线游戏世界</p>
          <input
            type="text"
            placeholder="输入你的用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && connect()}
            className={styles.loginInput}
          />
          <button onClick={connect} className={styles.loginButton}>
            🚀 进入游戏
          </button>
        </div>
      </div>
    )
  }

  // 渲染游戏界面
  return (
    <div className={styles.gameContainer}>
      {/* 角色选择 */}
      {showCharacterSelect && (
        <CharacterSelect onSelect={handleCharacterSelect}/>
      )}

      {/* 顶部栏 */}
      <div className={styles.topBar}>
        <div className={styles.userInfo}>
          <span className={styles.username}>👤 {username}</span>
          {selectedCharacter && (
            <span
              className={styles.character}
              onClick={() => setShowCharacterSelect(true)}
              title="点击重新选择角色"
            >
              {selectedCharacter.emoji} {selectedCharacter.name}
            </span>
          )}
        </div>
        <div className={styles.stats}>
          <span>🌐 在线: {onlineUsers.length + 1}</span>
          <span>🔗 连接: {connections.size}</span>
          {currentVoiceRoom && (
            <span className={styles.voiceStatus}>
              🎤 语音室
            </span>
          )}
        </div>
        <button onClick={disconnect} className={styles.disconnectBtn}>
          ❌ 退出
        </button>
      </div>

      {/* 主游戏区域 */}
      <div className={styles.mainContent}>
        {/* 游戏世界 */}
        <div className={styles.gameWorld}>
          {myPlayer && <GameWorld fetchOnlineUsers={fetchOnlineUsers}/>}
        </div>

        {/* 语音室面板 */}
        <VoicePanel username={username}/>

        {/* 聊天面板 */}
        <ChatPanel username={username}/>
      </div>
    </div>
  )
}

