import { useState } from 'react'
import { useGameStore } from '@/store/gameStore'
import ConnectionManager from '@/services/ConnectionManager'
import styles from '../styles/Game.module.css'

const connectionManager = ConnectionManager.getInstance()

interface VoicePanelProps {
  username: string
  isMicEnabled: boolean
  myVolume: number
  playerMicStatus: Map<string, { enabled: boolean; muted: boolean }>
  playerVolumes: Map<string, number>
  audioDevices: MediaDeviceInfo[]
  selectedDeviceId: string
  onLoadAudioDevices: () => Promise<any>
  onDeviceChange: (deviceId: string) => Promise<void>
  onSetSelectedDeviceId: (deviceId: string) => void
}

export default function VoicePanel({
  username,
  isMicEnabled,
  myVolume,
  playerMicStatus,
  playerVolumes,
  audioDevices,
  selectedDeviceId,
  onLoadAudioDevices,
  onDeviceChange,
  onSetSelectedDeviceId
}: VoicePanelProps) {
  const [showVoicePanel, setShowVoicePanel] = useState(true)
  const [showDeviceSelector, setShowDeviceSelector] = useState(false)

  // 从 gameStore 获取状态
  const currentVoiceRoom = useGameStore((state) => state.currentVoiceRoom)
  const playersInRooms = useGameStore((state) => state.playersInRooms)
  const otherPlayers = useGameStore((state) => state.otherPlayers)

  const myPeerId = connectionManager.getPeerId()

  // 如果不在语音室，不显示面板
  if (!currentVoiceRoom) {
    return null
  }

  return (
    <div className={`${styles.voicePanel} ${showVoicePanel ? styles.voicePanelVisible : styles.voicePanelHidden}`}>
      <div className={styles.voicePanelHeader}>
        <h3>🎤 语音室 {currentVoiceRoom}</h3>
        <button
          onClick={() => setShowVoicePanel(!showVoicePanel)}
          className={styles.toggleVoiceBtn}
        >
          {showVoicePanel ? '▼' : '▲'}
        </button>
      </div>

      {showVoicePanel && (
        <div className={styles.voicePanelContent}>
          {/* 麦克风设备选择器 */}
          <div className={styles.deviceSelector}>
            <button
              onClick={() => {
                onLoadAudioDevices()
                setShowDeviceSelector(!showDeviceSelector)
              }}
              className={styles.deviceSelectorBtn}
            >
              🎙️ {(() => {
                const currentDevice = audioDevices.find(d => d.deviceId === selectedDeviceId)
                if (currentDevice) {
                  return currentDevice.label || '默认麦克风'
                }
                return '选择麦克风'
              })()}
            </button>

            {showDeviceSelector && (
              <div className={styles.deviceList}>
                {audioDevices.map(device => (
                  <div
                    key={device.deviceId}
                    className={`${styles.deviceItem} ${selectedDeviceId === device.deviceId ? styles.deviceItemSelected : ''}`}
                    onClick={async () => {
                      onSetSelectedDeviceId(device.deviceId)
                      setShowDeviceSelector(false)
                      await onDeviceChange(device.deviceId)
                    }}
                  >
                    {selectedDeviceId === device.deviceId && '✓ '}
                    {device.label || `麦克风 ${device.deviceId.slice(0, 8)}`}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 我自己 */}
          <div className={styles.voiceUser}>
            <div className={styles.voiceUserInfo}>
              <span className={styles.voiceUserName}>
                👤 {username} (你)
              </span>
              <span className={styles.voiceMicStatus}>
                {isMicEnabled ? '🎤 开启' : '🔇 关闭'}
              </span>
            </div>
            {isMicEnabled && (
              <div className={styles.volumeBar}>
                <div
                  className={styles.volumeLevel}
                  style={{ width: `${myVolume}%` }}
                />
              </div>
            )}
          </div>

          {/* 房间内的其他玩家 */}
          {Array.from(playersInRooms.get(currentVoiceRoom) || [])
            .filter(peerId => peerId !== myPeerId)
            .map(peerId => {
              const player = otherPlayers.get(peerId)
              const micStatus = playerMicStatus.get(peerId)
              const volume = playerVolumes.get(peerId) || 0

              return (
                <div key={peerId} className={styles.voiceUser}>
                  <div className={styles.voiceUserInfo}>
                    <span className={styles.voiceUserName}>
                      {player?.character.emoji || '👤'} {player?.username || '未知玩家'}
                    </span>
                    <span className={styles.voiceMicStatus}>
                      {!micStatus ? (
                        <span className={styles.micConnecting}>⏳ 连接中...</span>
                      ) : micStatus.muted ? (
                        <span className={styles.micMuted}>🔇 静音</span>
                      ) : micStatus.enabled ? (
                        <span className={styles.micActive}>🎤 正常</span>
                      ) : (
                        <span className={styles.micDisabled}>🔇 关闭</span>
                      )}
                    </span>
                  </div>
                  {micStatus && micStatus.enabled && !micStatus.muted && (
                    <div className={styles.volumeBar}>
                      <div
                        className={styles.volumeLevel}
                        style={{ width: `${volume}%` }}
                      />
                    </div>
                  )}
                </div>
              )
            })}

          {/* 如果房间里只有自己 */}
          {(!playersInRooms.get(currentVoiceRoom) ||
            playersInRooms.get(currentVoiceRoom)!.size <= 1) && (
            <div className={styles.emptyVoiceRoom}>
              <p>📭 房间里只有你一个人</p>
              <p>等待其他玩家加入...</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

