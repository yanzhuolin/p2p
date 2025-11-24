import { useState, useEffect, useRef } from 'react'
import Peer, { DataConnection } from 'peerjs'
import styles from '../styles/Chat.module.css'

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
const API_SERVER = 'http://localhost:3001'

export default function Home() {
  const [username, setUsername] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [myPeerId, setMyPeerId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [connections, setConnections] = useState<Map<string, DataConnection>>(new Map())

  const peerRef = useRef<Peer | null>(null)
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const userListIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 清除定时器
      if (userListIntervalRef.current) {
        clearInterval(userListIntervalRef.current)
      }

      // 关闭所有连接
      connectionsRef.current.forEach((conn) => {
        try {
          conn.close()
        } catch (error) {
          // 忽略错误
        }
      })

      // 销毁 Peer
      if (peerRef.current && !peerRef.current.destroyed) {
        try {
          peerRef.current.destroy()
        } catch (error) {
          // 忽略错误
        }
      }
    }
  }, [])

  // 获取在线用户列表
  const fetchOnlineUsers = async () => {
    // 检查 peer 是否存在且未销毁
    if (!peerRef.current || peerRef.current.destroyed) {
      return
    }

    try {
      const response = await fetch(`${API_SERVER}/api/users`, {
        signal: AbortSignal.timeout(5000) // 5秒超时
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      const users = data.users.filter((u: OnlineUser) => u.peerId !== myPeerId)
      setOnlineUsers(users)

      // 自动连接到新用户
      users.forEach((user: OnlineUser) => {
        if (!connectionsRef.current.has(user.peerId)) {
          // 添加小延迟，避免同时发起太多连接
          setTimeout(() => connectToPeer(user.peerId), Math.random() * 1000)
        }
      })
    } catch (error: any) {
      // 忽略超时和中止错误
      if (error.name !== 'AbortError' && error.name !== 'TimeoutError') {
        console.error('⚠️ 获取在线用户失败:', error.message)
      }
    }
  }

  // 处理接收到的连接
  const handleIncomingConnection = (conn: DataConnection) => {
    console.log('📥 收到连接请求:', conn.peer)

    // 存储连接
    connectionsRef.current.set(conn.peer, conn)
    setConnections(new Map(connectionsRef.current))

    conn.on('data', (data: any) => {
      const newMessage: Message = {
        id: `${data.timestamp}-${Math.random()}`,
        text: data.text,
        sender: data.sender,
        timestamp: data.timestamp,
        isMine: false
      }
      setMessages(prev => [...prev, newMessage])
    })

    conn.on('close', () => {
      console.log('❌ 连接已关闭:', conn.peer)
      connectionsRef.current.delete(conn.peer)
      setConnections(new Map(connectionsRef.current))
    })

    conn.on('error', (err) => {
      console.error('⚠️ 连接错误:', conn.peer, err)
      connectionsRef.current.delete(conn.peer)
      setConnections(new Map(connectionsRef.current))
    })
  }

  // 连接到信令服务器
  const connectToServer = () => {
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
        await fetch(`${API_SERVER}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerId: id, username })
        })

        console.log('✅ 已注册到服务器')

        // 延迟一下再获取用户列表，确保连接稳定
        setTimeout(async () => {
          await fetchOnlineUsers()

          // 定期刷新在线用户列表并建立新连接
          if (userListIntervalRef.current) {
            clearInterval(userListIntervalRef.current)
          }
          userListIntervalRef.current = setInterval(fetchOnlineUsers, 3000)
        }, 500)

      } catch (error) {
        console.error('❌ 注册失败:', error)
      }
    })

    peer.on('connection', handleIncomingConnection)

    peer.on('error', (err) => {
      console.error('❌ Peer错误:', err)
      // 只在严重错误时弹窗
      if (err.type === 'unavailable-id' || err.type === 'server-error') {
        alert('连接错误: ' + err.message)
      }
    })

    peer.on('disconnected', () => {
      console.log('⚠️ 与信令服务器断开连接')
      // 尝试重连
      if (peerRef.current && !peerRef.current.destroyed) {
        console.log('🔄 尝试重新连接...')
        peerRef.current.reconnect()
      }
    })
  }

  // 连接到其他用户
  const connectToPeer = (peerId: string) => {
    // 检查 peer 是否存在且未销毁
    if (!peerRef.current || peerRef.current.destroyed || connectionsRef.current.has(peerId)) {
      return
    }

    console.log('🔗 正在连接到:', peerId)

    try {
      const conn = peerRef.current.connect(peerId, {
        reliable: true
      })

      // 设置连接超时
      const timeout = setTimeout(() => {
        if (!conn.open) {
          console.warn('⏰ 连接超时:', peerId)
          conn.close()
        }
      }, 10000) // 10秒超时

      conn.on('open', () => {
        clearTimeout(timeout)
        console.log('✅ 已连接到:', peerId)
        connectionsRef.current.set(peerId, conn)
        setConnections(new Map(connectionsRef.current))
      })

      conn.on('data', (data: any) => {
        const newMessage: Message = {
          id: `${data.timestamp}-${Math.random()}`,
          text: data.text,
          sender: data.sender,
          timestamp: data.timestamp,
          isMine: false
        }
        setMessages(prev => [...prev, newMessage])
      })

      conn.on('close', () => {
        clearTimeout(timeout)
        console.log('❌ 连接已关闭:', peerId)
        connectionsRef.current.delete(peerId)
        setConnections(new Map(connectionsRef.current))
      })

      conn.on('error', (err) => {
        clearTimeout(timeout)
        // 只在非预期错误时输出
        if (err.type !== 'peer-unavailable') {
          console.error('⚠️ 连接错误:', peerId, err.type)
        }
        connectionsRef.current.delete(peerId)
        setConnections(new Map(connectionsRef.current))
      })
    } catch (error) {
      console.error('❌ 创建连接失败:', peerId, error)
    }
  }

  // 广播消息到所有连接的用户
  const sendMessage = () => {
    if (!messageInput.trim()) return

    const timestamp = Date.now()
    const message = {
      text: messageInput,
      sender: username,
      timestamp
    }

    // 广播到所有已连接的用户
    let sentCount = 0
    connectionsRef.current.forEach((conn, peerId) => {
      if (conn.open) {
        try {
          conn.send(message)
          sentCount++
        } catch (error) {
          console.error('发送消息失败:', peerId, error)
        }
      }
    })

    console.log(`📤 消息已广播给 ${sentCount} 个用户`)

    // 添加到本地消息列表
    const newMessage: Message = {
      id: `${timestamp}-${Math.random()}`,
      text: messageInput,
      sender: username,
      timestamp,
      isMine: true
    }

    setMessages(prev => [...prev, newMessage])
    setMessageInput('')
  }

  // 断开连接
  const disconnect = async () => {
    // 清除定时器
    if (userListIntervalRef.current) {
      clearInterval(userListIntervalRef.current)
      userListIntervalRef.current = null
    }

    // 关闭所有连接
    connectionsRef.current.forEach((conn) => {
      try {
        conn.close()
      } catch (error) {
        console.error('关闭连接失败:', error)
      }
    })
    connectionsRef.current.clear()
    setConnections(new Map())

    // 从API服务器注销
    if (myPeerId) {
      try {
        await fetch(`${API_SERVER}/api/unregister`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerId: myPeerId })
        })
      } catch (error) {
        console.error('注销失败:', error)
      }
    }

    // 销毁 Peer 实例
    if (peerRef.current && !peerRef.current.destroyed) {
      try {
        peerRef.current.destroy()
      } catch (error) {
        console.error('销毁 Peer 失败:', error)
      }
    }
    peerRef.current = null

    // 重置状态
    setIsConnected(false)
    setMyPeerId('')
    setMessages([])
    setOnlineUsers([])

    console.log('✅ 已完全断开连接')
  }

  if (!isConnected) {
    return (
      <div className={styles.container}>
        <div className={styles.loginBox}>
          <h1 className={styles.title}>🚀 P2P 聊天室</h1>
          <p className={styles.subtitle}>基于 PeerJS 的点对点聊天</p>
          <input
            type="text"
            placeholder="输入你的用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && connectToServer()}
            className={styles.input}
          />
          <button onClick={connectToServer} className={styles.button}>
            连接到服务器
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.chatContainer}>
        <div className={styles.header}>
          <div>
            <h2>🌐 P2P 广播聊天室</h2>
            <p className={styles.peerId}>你的ID: {myPeerId}</p>
            <p className={styles.status}>
              已连接 {connections.size} 个用户 | 在线 {onlineUsers.length} 人
            </p>
          </div>
          <button onClick={disconnect} className={styles.disconnectButton}>
            断开连接
          </button>
        </div>

        <div className={styles.mainContent}>
          <div className={styles.sidebar}>
            <h3>在线用户 ({onlineUsers.length})</h3>
            <div className={styles.userList}>
              {onlineUsers.map((user) => {
                const isConnected = connections.has(user.peerId)
                return (
                  <div
                    key={user.peerId}
                    className={`${styles.userItem} ${isConnected ? styles.userConnected : ''}`}
                  >
                    <span className={styles.userIcon}>
                      {isConnected ? '🟢' : '🔴'}
                    </span>
                    <div>
                      <div className={styles.userName}>{user.username}</div>
                      <div className={styles.userPeerId}>
                        {user.peerId.substring(0, 8)}...
                      </div>
                    </div>
                  </div>
                )
              })}
              {onlineUsers.length === 0 && (
                <p className={styles.noUsers}>暂无其他在线用户</p>
              )}
            </div>
            <div className={styles.broadcastInfo}>
              <p>💡 消息会自动广播给所有在线用户</p>
            </div>
          </div>

          <div className={styles.chatArea}>
            <div className={styles.messages}>
              {messages.length === 0 && (
                <div className={styles.emptyMessages}>
                  <p>👋 欢迎来到聊天室！</p>
                  <p>开始发送消息吧~</p>
                </div>
              )}
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`${styles.message} ${msg.isMine ? styles.myMessage : styles.theirMessage}`}
                >
                  <div className={styles.messageSender}>{msg.sender}</div>
                  <div className={styles.messageText}>{msg.text}</div>
                  <div className={styles.messageTime}>
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className={styles.inputArea}>
              <input
                type="text"
                placeholder="输入消息... (按 Enter 发送)"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                className={styles.messageInput}
              />
              <button
                onClick={sendMessage}
                disabled={!messageInput.trim()}
                className={styles.sendButton}
              >
                📤 广播
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

