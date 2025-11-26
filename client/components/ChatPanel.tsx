import { useState, useRef, useEffect } from 'react'
import { useChatStore, Message } from '@/store/chatStore'
import ConnectionManager from '../services/ConnectionManager'
import styles from '../styles/ChatPanel.module.css'

const connectionManager = ConnectionManager.getInstance()

interface ChatPanelProps {
  username: string
}

export default function ChatPanel({ username }: ChatPanelProps) {
  const [inputText, setInputText] = useState('')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const messages = useChatStore((state) => state.messages)
  const addMessage = useChatStore((state) => state.addMessage)
  const peerId = connectionManager.getPeerId()

  // 订阅聊天消息
  useEffect(() => {
    const unsubscribe = connectionManager.onData((data, fromPeerId) => {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data

        // 只处理聊天消息（有 text 字段且没有 type 字段，或者 type 不是游戏/语音相关）
        if (parsed.text && !parsed.type) {
          const message: Message = {
            id: parsed.id || `${Date.now()}-${Math.random()}`,
            peerId: fromPeerId,
            username: parsed.username || parsed.sender || '未知用户',
            text: parsed.text,
            timestamp: parsed.timestamp
          }
          addMessage(message)
        }
      } catch (error) {
        // 忽略非聊天消息
      }
    })

    return () => {
      unsubscribe()
    }
  }, [addMessage])

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!inputText.trim()) return

    const message: Message = {
      id: `${Date.now()}-${Math.random()}`,
      peerId: peerId,
      username: username,
      text: inputText.trim(),
      timestamp: Date.now()
    }

    // 添加到本地消息列表
    addMessage(message)

    // 广播给其他用户
    const messageData = {
      id: message.id,
      text: message.text,
      username: message.username,
      timestamp: message.timestamp
    }
    connectionManager.broadcast(JSON.stringify(messageData))

    setInputText('')
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={styles.chatPanel}>
      <div 
        className={styles.chatHeader}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span>💬 聊天室</span>
        <span className={styles.collapseIcon}>
          {isCollapsed ? '▼' : '▲'}
        </span>
      </div>

      {!isCollapsed && (
        <>
          <div className={styles.chatMessages}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`${styles.chatMessage} ${
                  msg.peerId === peerId ? styles.myMessage : styles.otherMessage
                }`}
              >
                <div className={styles.messageHeader}>
                  <span className={styles.messageUsername}>
                    {msg.username}
                  </span>
                  <span className={styles.messageTime}>
                    {new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className={styles.messageText}>{msg.text}</div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.chatInput}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="输入消息..."
              className={styles.chatInputField}
            />
            <button onClick={handleSend} className={styles.chatSendBtn}>
              发送
            </button>
          </div>
        </>
      )}
    </div>
  )
}

