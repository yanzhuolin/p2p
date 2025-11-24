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
  const [targetPeerId, setTargetPeerId] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [activeConnection, setActiveConnection] = useState<DataConnection | null>(null)
  const [connectionStatus, setConnectionStatus] = useState('')

  const peerRef = useRef<Peer | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 自动滚动到最新消息
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // 获取在线用户列表
  const fetchOnlineUsers = async () => {
    try {
      const response = await fetch(`${API_SERVER}/api/users`)
      const data = await response.json()
      setOnlineUsers(data.users.filter((u: OnlineUser) => u.peerId !== myPeerId))
    } catch (error) {
      console.error('获取在线用户失败:', error)
    }
  }

  // 处理接收到的连接
  const handleIncomingConnection = (conn: DataConnection) => {
    console.log('收到连接请求:', conn.peer)
    setConnectionStatus(`已连接到: ${conn.peer}`)
    setActiveConnection(conn)

    conn.on('data', (data: any) => {
      const newMessage: Message = {
        id: Date.now().toString(),
        text: data.text,
        sender: data.sender,
        timestamp: data.timestamp,
        isMine: false
      }
      setMessages(prev => [...prev, newMessage])
    })

    conn.on('close', () => {
      console.log('连接已关闭')
      setConnectionStatus('连接已断开')
      setActiveConnection(null)
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
      console.log('我的Peer ID:', id)
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
        fetchOnlineUsers()
        // 定期刷新在线用户列表
        setInterval(fetchOnlineUsers, 5000)
      } catch (error) {
        console.error('注册失败:', error)
      }
    })

    peer.on('connection', handleIncomingConnection)

    peer.on('error', (err) => {
      console.error('Peer错误:', err)
      alert('连接错误: ' + err.message)
    })

    peer.on('disconnected', () => {
      console.log('与信令服务器断开连接')
      setConnectionStatus('与信令服务器断开连接')
    })
  }

  // 连接到其他用户
  const connectToPeer = (peerId: string) => {
    if (!peerRef.current) return

    if (activeConnection) {
      activeConnection.close()
    }

    const conn = peerRef.current.connect(peerId, {
      reliable: true
    })

    conn.on('open', () => {
      console.log('已连接到:', peerId)
      setConnectionStatus(`已连接到: ${peerId}`)
      setActiveConnection(conn)
      setTargetPeerId(peerId)
    })

    conn.on('data', (data: any) => {
      const newMessage: Message = {
        id: Date.now().toString(),
        text: data.text,
        sender: data.sender,
        timestamp: data.timestamp,
        isMine: false
      }
      setMessages(prev => [...prev, newMessage])
    })

    conn.on('close', () => {
      console.log('连接已关闭')
      setConnectionStatus('连接已断开')
      setActiveConnection(null)
    })

    conn.on('error', (err) => {
      console.error('连接错误:', err)
      alert('连接失败: ' + err)
    })
  }

  // 发送消息
  const sendMessage = () => {
    if (!messageInput.trim() || !activeConnection) return

    const message = {
      text: messageInput,
      sender: username,
      timestamp: Date.now()
    }

    activeConnection.send(message)

    const newMessage: Message = {
      id: Date.now().toString(),
      text: messageInput,
      sender: username,
      timestamp: Date.now(),
      isMine: true
    }

    setMessages(prev => [...prev, newMessage])
    setMessageInput('')
  }

  // 断开连接
  const disconnect = async () => {
    if (activeConnection) {
      activeConnection.close()
    }
    if (peerRef.current) {
      // 从API服务器注销
      try {
        await fetch(`${API_SERVER}/api/unregister`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ peerId: myPeerId })
        })
      } catch (error) {
        console.error('注销失败:', error)
      }
      peerRef.current.destroy()
    }
    setIsConnected(false)
    setMyPeerId('')
    setMessages([])
    setConnectionStatus('')
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
            <h2>P2P 聊天室</h2>
            <p className={styles.peerId}>你的ID: {myPeerId}</p>
            <p className={styles.status}>{connectionStatus || '等待连接...'}</p>
          </div>
          <button onClick={disconnect} className={styles.disconnectButton}>
            断开连接
          </button>
        </div>

        <div className={styles.mainContent}>
          <div className={styles.sidebar}>
            <h3>在线用户 ({onlineUsers.length})</h3>
            <div className={styles.userList}>
              {onlineUsers.map((user) => (
                <div
                  key={user.peerId}
                  className={styles.userItem}
                  onClick={() => connectToPeer(user.peerId)}
                >
                  <span className={styles.userIcon}>👤</span>
                  <div>
                    <div className={styles.userName}>{user.username}</div>
                    <div className={styles.userPeerId}>{user.peerId.substring(0, 8)}...</div>
                  </div>
                </div>
              ))}
              {onlineUsers.length === 0 && (
                <p className={styles.noUsers}>暂无其他在线用户</p>
              )}
            </div>
          </div>

          <div className={styles.chatArea}>
            <div className={styles.messages}>
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
                placeholder={activeConnection ? "输入消息..." : "请先选择一个用户进行连接"}
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                disabled={!activeConnection}
                className={styles.messageInput}
              />
              <button
                onClick={sendMessage}
                disabled={!activeConnection || !messageInput.trim()}
                className={styles.sendButton}
              >
                发送
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

