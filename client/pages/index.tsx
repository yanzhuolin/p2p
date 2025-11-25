import { useState, useEffect, useRef } from 'react'
import Peer, { DataConnection } from 'peerjs'
import GameWorld from '../components/GameWorld'
import CharacterSelect from '../components/CharacterSelect'
import { Character, Player, Position, PlayerUpdate, GAME_CONFIG, CHARACTERS } from '../types/game'
import styles from '../styles/Game.module.css'

interface Message {
  id: string
  text: string
  sender: string
  timestamp: number
  isMine: boolean
}

interface OnlineUser {
  peerId: string
  username: string
}

const SIGNALING_SERVER = 'localhost'
const SIGNALING_PORT = 9000
const API_SERVER = 'http://192.168.120.44:3001'

export default function Home() {
  // 基础状态
  const [username, setUsername] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [myPeerId, setMyPeerId] = useState('')

  // 游戏状态
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [showCharacterSelect, setShowCharacterSelect] = useState(false)
  const [myPlayer, setMyPlayer] = useState<Player | null>(null)
  const [otherPlayers, setOtherPlayers] = useState<Map<string, Player>>(new Map())

  // 聊天状态
  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [connections, setConnections] = useState<Map<string, DataConnection>>(new Map())
  const [showChat, setShowChat] = useState(true)

  // Refs
  const peerRef = useRef<Peer | null>(null)
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const userListIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const myPlayerRef = useRef<Player | null>(null)

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 页面刷新/关闭时清理
  useEffect(() => {
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      const currentPeerId = peerRef.current?.id
      if (currentPeerId) {
        const data = JSON.stringify({ peerId: currentPeerId })
        navigator.sendBeacon(`${API_SERVER}/api/unregister`, new Blob([data], { type: 'application/json' }))
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (userListIntervalRef.current) {
        clearInterval(userListIntervalRef.current)
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
      }

      connectionsRef.current.forEach((conn) => {
        try {
          conn.close()
        } catch (error) {
          // 忽略错误
        }
      })

      const currentPeerId = peerRef.current?.id
      if (currentPeerId) {
        navigator.sendBeacon(`${API_SERVER}/api/unregister`, new Blob([JSON.stringify({ peerId: currentPeerId })], { type: 'application/json' }))
      }
    }
  }, [])

  // 发送心跳
  const sendHeartbeat = async () => {
    const currentPeerId = peerRef.current?.id
    if (!currentPeerId || !peerRef.current || peerRef.current.destroyed) return

    try {
      await fetch(`${API_SERVER}/api/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ peerId: currentPeerId }),
        signal: AbortSignal.timeout(3000)
      })
    } catch (error) {
      // 忽略心跳错误
    }
  }

  // 广播游戏状态更新
  const broadcastGameUpdate = (update: PlayerUpdate) => {
    const message = JSON.stringify(update)
    connectionsRef.current.forEach((conn, peerId) => {
      if (conn.open) {
        try {
          conn.send(message)
        } catch (error) {
          console.error(`发送游戏更新失败 (${peerId}):`, error)
        }
      }
    })
  }

  // 处理位置更新
  const handlePositionUpdate = (position: Position, velocity: { x: number; y: number }) => {
    if (!myPlayer) return

    // 更新本地玩家位置
    setMyPlayer(prev => {
      const updated = prev ? { ...prev, position, velocity, lastUpdate: Date.now() } : null
      myPlayerRef.current = updated
      return updated
    })

    // 广播位置更新
    const update: PlayerUpdate = {
      type: 'position',
      peerId: peerRef.current?.id || '',
      position,
      velocity,
      timestamp: Date.now()
    }
    broadcastGameUpdate(update)
  }

  // 处理角色选择
  const handleCharacterSelect = (character: Character) => {
    setSelectedCharacter(character)
    setShowCharacterSelect(false)

    // 创建玩家对象
    const player: Player = {
      peerId: peerRef.current?.id || '',
      username,
      character,
      position: {
        x: GAME_CONFIG.CANVAS_WIDTH / 2,
        y: GAME_CONFIG.CANVAS_HEIGHT / 2
      },
      velocity: { x: 0, y: 0 },
      lastUpdate: Date.now()
    }
    setMyPlayer(player)
    myPlayerRef.current = player
    console.log('🎮 创建玩家对象:', player)

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
  }

  // 获取在线用户列表
  const fetchOnlineUsers = async () => {
    if (!peerRef.current || peerRef.current.destroyed) {
      return
    }

    const currentPeerId = peerRef.current.id

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
        if (!connectionsRef.current.has(user.peerId)) {
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
    if (!peerRef.current || peerRef.current.destroyed) {
      return
    }

    if (connectionsRef.current.has(peerId)) {
      return
    }

    console.log('🔗 正在连接到:', peerId)

    try {
      const conn = peerRef.current.connect(peerId, {
        reliable: true,
        serialization: 'json'
      })

      const timeoutId = setTimeout(() => {
        if (!conn.open) {
          console.log('⏰ 连接超时:', peerId)
          conn.close()
        }
      }, 10000)

      conn.on('open', () => {
        clearTimeout(timeoutId)
        console.log('✅ 已连接到:', peerId)
        connectionsRef.current.set(peerId, conn)
        setConnections(new Map(connectionsRef.current))

        // 如果已经选择了角色，发送加入消息
        if (myPlayerRef.current) {
          const update: PlayerUpdate = {
            type: 'join',
            peerId: myPlayerRef.current.peerId,
            username: myPlayerRef.current.username,
            character: myPlayerRef.current.character,
            position: myPlayerRef.current.position,
            timestamp: Date.now()
          }
          console.log('📤 发送我的状态给:', peerId, update)
          conn.send(JSON.stringify(update))
        } else {
          console.log('⚠️ 连接建立但还没有选择角色')
        }
      })

      conn.on('data', (data) => {
        handleIncomingData(data, peerId)
      })

      conn.on('close', () => {
        console.log('❌ 连接关闭:', peerId)
        connectionsRef.current.delete(peerId)
        setConnections(new Map(connectionsRef.current))

        // 移除该玩家
        setOtherPlayers(prev => {
          const newMap = new Map(prev)
          newMap.delete(peerId)
          return newMap
        })
      })

      conn.on('error', (err) => {
        clearTimeout(timeoutId)
        const errorType = (err as any).type
        if (errorType !== 'peer-unavailable' && errorType !== 'network') {
          console.error('⚠️ 连接错误:', peerId, errorType)
        }
      })
    } catch (error) {
      console.error('连接失败:', error)
    }
  }



  // 处理接收到的数据
  const handleIncomingData = (data: any, fromPeerId: string) => {
    try {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data

      // 游戏更新
      if (parsed.type) {
        handleGameUpdate(parsed as PlayerUpdate, fromPeerId)
      }
      // 聊天消息
      else if (parsed.text) {
        const message: Message = {
          id: parsed.id || `${Date.now()}-${Math.random()}`,
          text: parsed.text,
          sender: parsed.sender,
          timestamp: parsed.timestamp,
          isMine: false
        }

        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) {
            return prev
          }
          return [...prev, message]
        })
      }
    } catch (error) {
      console.error('处理数据失败:', error)
    }
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
          setOtherPlayers(prev => {
            const updated = new Map(prev).set(fromPeerId, newPlayer)
            console.log('🎮 玩家加入:', update.username, '当前其他玩家数:', updated.size)
            return updated
          })
        } else {
          console.log('⚠️ join 消息缺少必要字段:', update)
        }
        break

      case 'position':
        if (update.position) {
          setOtherPlayers(prev => {
            const player = prev.get(fromPeerId)
            if (player) {
              const updated = {
                ...player,
                position: update.position!,
                velocity: update.velocity || { x: 0, y: 0 },
                lastUpdate: Date.now()
              }
              return new Map(prev).set(fromPeerId, updated)
            }
            return prev
          })
        }
        break

      case 'leave':
        setOtherPlayers(prev => {
          const newMap = new Map(prev)
          newMap.delete(fromPeerId)
          return newMap
        })
        console.log('🎮 玩家离开:', fromPeerId)
        break
    }
  }

  // 连接到服务器
  const connect = async () => {
    if (!username.trim()) {
      alert('请输入用户名')
      return
    }

    const peer = new Peer({
      host: SIGNALING_SERVER,
      port: SIGNALING_PORT,
      path: '/myapp',
      debug: 2
    })

    peer.on('open', async (id) => {
      console.log('✅ 我的Peer ID:', id)
      setMyPeerId(id)
      setIsConnected(true)
      peerRef.current = peer

      // 注册到API服务器
      try {
        const response = await fetch(`${API_SERVER}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerId: id, username })
        })
        const data = await response.json()
        if (data.success) {
          console.log('✅ 已注册到服务器')
        }
      } catch (error) {
        console.error('注册失败:', error)
      }

      // 启动心跳
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
      }
      heartbeatIntervalRef.current = setInterval(sendHeartbeat, 10000)
      sendHeartbeat()

      // 延迟后获取用户列表
      setTimeout(fetchOnlineUsers, 500)

      // 定期刷新用户列表
      if (userListIntervalRef.current) {
        clearInterval(userListIntervalRef.current)
      }
      userListIntervalRef.current = setInterval(fetchOnlineUsers, 3000)

      // 显示角色选择
      setShowCharacterSelect(true)
    })

    peer.on('connection', (conn) => {
      console.log('📥 收到连接请求:', conn.peer)

      conn.on('open', () => {
        console.log('✅ 接受连接:', conn.peer)
        connectionsRef.current.set(conn.peer, conn)
        setConnections(new Map(connectionsRef.current))

        // 如果已经选择了角色，发送加入消息
        if (myPlayerRef.current) {
          const update: PlayerUpdate = {
            type: 'join',
            peerId: myPlayerRef.current.peerId,
            username: myPlayerRef.current.username,
            character: myPlayerRef.current.character,
            position: myPlayerRef.current.position,
            timestamp: Date.now()
          }
          console.log('📤 发送我的状态给新连接:', conn.peer, update)
          conn.send(JSON.stringify(update))
        } else {
          console.log('⚠️ 接受连接但还没有选择角色')
        }
      })

      conn.on('data', (data) => {
        handleIncomingData(data, conn.peer)
      })

      conn.on('close', () => {
        console.log('❌ 连接关闭:', conn.peer)
        connectionsRef.current.delete(conn.peer)
        setConnections(new Map(connectionsRef.current))

        // 移除该玩家
        setOtherPlayers(prev => {
          const newMap = new Map(prev)
          newMap.delete(conn.peer)
          return newMap
        })
      })

      conn.on('error', (err) => {
        console.error('连接错误:', err)
      })
    })

    peer.on('disconnected', () => {
      console.log('🔄 与信令服务器断开，尝试重连...')
      if (!peer.destroyed) {
        peer.reconnect()
      }
    })

    peer.on('error', (err) => {
      const errorType = (err as any).type
      if (errorType === 'unavailable-id' || errorType === 'server-error') {
        console.error('❌ Peer错误:', err)
        alert(`连接错误: ${err.message}`)
      }
    })
  }

  // 发送消息
  const sendMessage = () => {
    if (!messageInput.trim()) return

    const message: Message = {
      id: `${Date.now()}-${Math.random()}`,
      text: messageInput,
      sender: username,
      timestamp: Date.now(),
      isMine: true
    }

    setMessages(prev => [...prev, message])

    const messageData = {
      id: message.id,
      text: message.text,
      sender: message.sender,
      timestamp: message.timestamp
    }

    let sentCount = 0
    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(JSON.stringify(messageData))
          sentCount++
        } catch (error) {
          console.error('发送消息失败:', error)
        }
      }
    })

    console.log(`📤 消息已广播给 ${sentCount} 个用户`)
    setMessageInput('')
  }

  // 断开连接
  const disconnect = async () => {
    if (userListIntervalRef.current) {
      clearInterval(userListIntervalRef.current)
      userListIntervalRef.current = null
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }

    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current)
      syncIntervalRef.current = null
    }

    // 广播离开消息
    const leaveUpdate: PlayerUpdate = {
      type: 'leave',
      peerId: peerRef.current?.id || '',
      timestamp: Date.now()
    }
    broadcastGameUpdate(leaveUpdate)

    connectionsRef.current.forEach((conn) => {
      try {
        conn.close()
      } catch (error) {
        console.error('关闭连接失败:', error)
      }
    })
    connectionsRef.current.clear()
    setConnections(new Map())

    const currentPeerId = peerRef.current?.id || myPeerId
    if (currentPeerId) {
      try {
        await fetch(`${API_SERVER}/api/unregister`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerId: currentPeerId })
        })
      } catch (error) {
        console.error('注销失败:', error)
      }
    }

    if (peerRef.current) {
      peerRef.current.destroy()
    }
    peerRef.current = null

    setIsConnected(false)
    setMyPeerId('')
    setMessages([])
    setOnlineUsers([])
    setMyPlayer(null)
    myPlayerRef.current = null
    setOtherPlayers(new Map())
    setSelectedCharacter(null)

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
        <CharacterSelect onSelect={handleCharacterSelect} />
      )}

      {/* 顶部栏 */}
      <div className={styles.topBar}>
        <div className={styles.userInfo}>
          <span className={styles.username}>👤 {username}</span>
          {selectedCharacter && (
            <span className={styles.character}>
              {selectedCharacter.emoji} {selectedCharacter.name}
            </span>
          )}
        </div>
        <div className={styles.stats}>
          <span>🌐 在线: {onlineUsers.length + 1}</span>
          <span>🔗 连接: {connections.size}</span>
        </div>
        <button onClick={disconnect} className={styles.disconnectBtn}>
          ❌ 退出
        </button>
      </div>

      {/* 主游戏区域 */}
      <div className={styles.mainContent}>
        {/* 游戏世界 */}
        <div className={styles.gameWorld}>
          {myPlayer && (
            <GameWorld
              myPlayer={myPlayer}
              otherPlayers={otherPlayers}
              onPositionUpdate={handlePositionUpdate}
            />
          )}
        </div>

        {/* 聊天面板 */}
        <div className={`${styles.chatPanel} ${showChat ? styles.chatVisible : styles.chatHidden}`}>
          <div className={styles.chatHeader}>
            <h3>💬 聊天</h3>
            <button
              onClick={() => setShowChat(!showChat)}
              className={styles.toggleChatBtn}
            >
              {showChat ? '▼' : '▲'}
            </button>
          </div>

          {showChat && (
            <>
              <div className={styles.messagesContainer}>
                {messages.length === 0 ? (
                  <div className={styles.emptyMessages}>
                    <p>💬 还没有消息</p>
                    <p>发送第一条消息吧！</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`${styles.message} ${
                        msg.isMine ? styles.myMessage : styles.otherMessage
                      }`}
                    >
                      <div className={styles.messageSender}>{msg.sender}</div>
                      <div className={styles.messageText}>{msg.text}</div>
                      <div className={styles.messageTime}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className={styles.inputContainer}>
                <input
                  type="text"
                  placeholder="输入消息..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  className={styles.messageInput}
                />
                <button onClick={sendMessage} className={styles.sendButton}>
                  📤
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

