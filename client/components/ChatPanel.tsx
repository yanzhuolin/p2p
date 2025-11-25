import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '../store/chatStore'
import styles from '../styles/ChatPanel.module.css'

interface ChatPanelProps {
  myPeerId: string
  onSendMessage: (text: string) => void
}

export default function ChatPanel({ myPeerId, onSendMessage }: ChatPanelProps) {
  const [inputText, setInputText] = useState('')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const messages = useChatStore((state) => state.messages)

  // 自动滚动到最新消息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText.trim())
      setInputText('')
    }
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
                  msg.peerId === myPeerId ? styles.myMessage : styles.otherMessage
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

