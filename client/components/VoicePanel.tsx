import { useState, useRef, useEffect } from 'react'
import { MediaConnection } from 'peerjs'
import { useGameStore } from '@/store/gameStore'
import { VoiceRoomUpdate } from '@/types/game'
import ConnectionManager from '@/services/ConnectionManager'
import styles from '../styles/Game.module.css'

const connectionManager = ConnectionManager.getInstance()

interface VoicePanelProps {
  username: string
}

export default function VoicePanel({ username }: VoicePanelProps) {
  // UI 状态
  const [showVoicePanel, setShowVoicePanel] = useState(true)
  const [showDeviceSelector, setShowDeviceSelector] = useState(false)

  // 音频设备状态
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [isMicEnabled, setIsMicEnabled] = useState(false)

  // 音量和状态
  const [myVolume, setMyVolume] = useState(0)
  const [playerMicStatus, setPlayerMicStatus] = useState<Map<string, { enabled: boolean; muted: boolean }>>(new Map())
  const [playerVolumes, setPlayerVolumes] = useState<Map<string, number>>(new Map())

  // Refs
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const audioAnalyzersRef = useRef<Map<string, AnalyserNode>>(new Map())
  const localAnalyzerRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map())
  const prevRoomRef = useRef<string | null>(null)  // 用于跟踪上一个语音室

  // 从 gameStore 获取状态
  const currentVoiceRoom = useGameStore((state) => state.currentVoiceRoom)
  const playersInRooms = useGameStore((state) => state.playersInRooms)
  const otherPlayers = useGameStore((state) => state.otherPlayers)
  const addPlayerToRoom = useGameStore((state) => state.addPlayerToRoom)
  const removePlayerFromRoom = useGameStore((state) => state.removePlayerFromRoom)

  const myPeerId = connectionManager.getPeerId()

  // ==================== 音量监听 ====================

  // 使用 ScriptProcessor 创建音频分析器并开始监听音量
  const startVolumeMonitoring = (stream: MediaStream, peerId: string | null = null) => {
    try {
      // 复用或创建 AudioContext
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }

      const audioContext = audioContextRef.current

      // 确保 AudioContext 已启动
      if (audioContext.state === 'suspended') {
        audioContext.resume()
      }

      // 每次都创建新的 source（因为 stream 可能不同）
      const sourceKey = peerId || 'local'

      // 先断开旧的连接
      const oldSource = audioSourcesRef.current.get(sourceKey)
      if (oldSource) {
        try {
          oldSource.disconnect()
        } catch (e) {}
      }

      // 创建新的 source
      const source = audioContext.createMediaStreamSource(stream)
      audioSourcesRef.current.set(sourceKey, source)

      // 使用 ScriptProcessorNode
      const processor = audioContext.createScriptProcessor(2048, 1, 1)

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)

        // 计算 RMS 音量
        let sum = 0
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i]
        }
        const rms = Math.sqrt(sum / inputData.length)
        const volume = Math.min(100, Math.round(rms * 500))

        if (peerId) {
          setPlayerVolumes(prev => {
            const newMap = new Map(prev)
            newMap.set(peerId, volume)
            return newMap
          })
        } else {
          setMyVolume(volume)
        }
      }

      // 连接：source -> processor -> destination
      source.connect(processor)
      processor.connect(audioContext.destination)

      // 保存 processor 以便后续清理
      if (peerId) {
        audioAnalyzersRef.current.set(peerId, processor as any)
      } else {
        localAnalyzerRef.current = processor as any
      }
    } catch (error) {
      console.error('创建音频分析器失败:', error)
    }
  }

  // 停止音量监听
  const stopVolumeMonitoring = (peerId: string | null = null) => {
    if (peerId) {
      const processor = audioAnalyzersRef.current.get(peerId)
      if (processor) {
        try {
          processor.disconnect()
        } catch (e) {}
        audioAnalyzersRef.current.delete(peerId)
      }

      const source = audioSourcesRef.current.get(peerId)
      if (source) {
        try {
          source.disconnect()
        } catch (e) {}
        audioSourcesRef.current.delete(peerId)
      }

      setPlayerVolumes(prev => {
        const newMap = new Map(prev)
        newMap.delete(peerId)
        return newMap
      })
    } else {
      if (localAnalyzerRef.current) {
        try {
          localAnalyzerRef.current.disconnect()
        } catch (e) {}
        localAnalyzerRef.current = null
      }

      const source = audioSourcesRef.current.get('local')
      if (source) {
        try {
          source.disconnect()
        } catch (e) {}
        audioSourcesRef.current.delete('local')
      }

      setMyVolume(0)
    }
  }

  // ==================== 音频设备管理 ====================

  // 检查麦克风权限状态
  const checkMicrophonePermission = async () => {
    try {
      // 某些浏览器不支持 permissions API
      if (!navigator.permissions || !navigator.permissions.query) {
        console.log('⚠️ 浏览器不支持 Permissions API，将直接请求麦克风')
        return 'prompt'
      }

      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      console.log('🎤 麦克风权限状态:', result.state)
      return result.state // 'granted', 'denied', 'prompt'
    } catch (error) {
      console.log('⚠️ 无法查询麦克风权限，将直接请求:', error)
      return 'prompt'
    }
  }

  // 获取可用的音频输入设备
  const loadAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      setAudioDevices(audioInputs)

      // 优先选择默认设备（deviceId 为 'default' 或第一个设备）
      let deviceToUse = selectedDeviceId
      if (!deviceToUse && audioInputs.length > 0) {
        const defaultDevice = audioInputs.find(d => d.deviceId === 'default') || audioInputs[0]
        deviceToUse = defaultDevice.deviceId
        setSelectedDeviceId(deviceToUse)
      }

      return { devices: audioInputs, selectedDevice: deviceToUse }
    } catch (error) {
      console.error('获取音频设备失败:', error)
      return { devices: [], selectedDevice: '' }
    }
  }

  // 获取麦克风权限并创建音频流
  const enableMicrophone = async (deviceId?: string) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('您的浏览器不支持语音功能，请使用最新版本的 Chrome、Edge 或 Firefox')
        return null
      }

      const constraints: MediaStreamConstraints = {
        audio: deviceId ? {
          deviceId: { exact: deviceId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)

      stream.getAudioTracks().forEach(track => {
        track.enabled = true
      })

      connectionManager.setLocalStream(stream)
      setIsMicEnabled(true)

      // 开始监听本地音量
      startVolumeMonitoring(stream, null)

      return stream
    } catch (error: any) {
      console.error('❌ 无法访问麦克风:', error)

      let errorMessage = '无法访问麦克风'

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = '麦克风权限被拒绝\n\n请按以下步骤操作：\n1. 点击地址栏左侧的锁图标\n2. 找到"麦克风"权限\n3. 设置为"允许"\n4. 刷新页面后重新进入语音室'
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = '未找到麦克风设备\n\n请检查：\n1. 麦克风是否已连接\n2. 系统设置中麦克风是否可用\n3. 其他应用是否占用了麦克风'
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = '无法读取麦克风\n\n可能原因：\n1. 麦克风被其他应用占用\n2. 麦克风硬件故障\n3. 请关闭其他使用麦克风的应用后重试'
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = '麦克风不支持请求的配置\n\n请尝试使用其他麦克风设备'
      } else if (error.name === 'SecurityError') {
        errorMessage = '安全错误\n\n请确保：\n1. 使用 HTTPS 或 localhost\n2. 浏览器版本是最新的'
      } else {
        errorMessage = `未知错误: ${error.message || error.name}\n\n请检查浏览器控制台获取更多信息`
      }

      alert(errorMessage)
      return null
    }
  }

  // 关闭麦克风
  const disableMicrophone = () => {
    const localStream = connectionManager.getLocalStream()
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      connectionManager.setLocalStream(null)
      setIsMicEnabled(false)
      console.log('🎤 麦克风已关闭')
    }

    // 停止本地音量监听
    stopVolumeMonitoring(null)
  }

  // ==================== 远程音频播放 ====================

  // 播放远程音频
  const playRemoteAudio = (peerId: string, stream: MediaStream) => {
    stopRemoteAudio(peerId)

    const audioTrack = stream.getAudioTracks()[0]

    // 更新玩家麦克风状态
    setPlayerMicStatus(prev => {
      const newMap = new Map(prev)
      newMap.set(peerId, {
        enabled: audioTrack?.enabled || false,
        muted: audioTrack?.muted || false
      })
      return newMap
    })

    const audio = new Audio()
    audio.srcObject = stream
    audio.autoplay = true
    audio.volume = 1.0

    remoteAudiosRef.current.set(peerId, audio)

    // 监听远程音频轨道的状态变化
    if (audioTrack) {
      audioTrack.onmute = () => {
        setPlayerMicStatus(prev => {
          const newMap = new Map(prev)
          const current = newMap.get(peerId) || { enabled: false, muted: false }
          newMap.set(peerId, { ...current, muted: true })
          return newMap
        })
      }
      audioTrack.onunmute = () => {
        setPlayerMicStatus(prev => {
          const newMap = new Map(prev)
          const current = newMap.get(peerId) || { enabled: false, muted: false }
          newMap.set(peerId, { ...current, muted: false })
          return newMap
        })
      }
      audioTrack.onended = () => {
        stopRemoteAudio(peerId)
      }
    }

    audio.play().then(() => {
      // 开始监听远程音量
      startVolumeMonitoring(stream, peerId)
    }).catch(error => {
      console.error('播放音频失败:', peerId, error)
    })
  }

  // 停止播放远程音频
  const stopRemoteAudio = (peerId: string) => {
    const audio = remoteAudiosRef.current.get(peerId)
    if (audio) {
      audio.pause()
      audio.srcObject = null
      remoteAudiosRef.current.delete(peerId)
    }

    // 停止音量监听
    stopVolumeMonitoring(peerId)

    // 清理麦克风状态
    setPlayerMicStatus(prev => {
      const newMap = new Map(prev)
      newMap.delete(peerId)
      return newMap
    })
  }

  // ==================== 语音室业务逻辑 ====================

  // 进入语音室
  const handleEnterVoiceRoom = async (roomId: string) => {
    const { selectedDevice } = await loadAudioDevices()

    const permissionState = await checkMicrophonePermission()

    if (permissionState === 'denied') {
      alert('麦克风权限已被拒绝\n\n请按以下步骤操作：\n1. 点击地址栏左侧的图标（锁或信息图标）\n2. 找到"麦克风"权限\n3. 设置为"允许"\n4. 刷新页面后重新进入语音室')
      return
    }

    const stream = await enableMicrophone(selectedDevice || undefined)
    if (!stream) {
      return
    }

    // 呼叫房间内的其他玩家
    const playersInRoom = playersInRooms.get(roomId)
    if (playersInRoom && playersInRoom.size > 0) {
      const myPeerId = connectionManager.getPeerId()
      playersInRoom.forEach(peerId => {
        if (peerId !== myPeerId) {
          connectionManager.callPeer(peerId, stream)
        }
      })
    }
  }

  // 离开语音室
  const handleLeaveVoiceRoom = async (roomId: string) => {
    connectionManager.closeAllCalls()

    // 停止所有远程音频
    remoteAudiosRef.current.forEach((audio, peerId) => {
      stopRemoteAudio(peerId)
    })

    disableMicrophone()
  }

  // 处理音频设备切换
  const handleDeviceChange = async (deviceId: string) => {
    if (isMicEnabled && currentVoiceRoom) {
      // 关闭所有通话
      connectionManager.closeAllCalls()

      // 停止所有远程音频
      remoteAudiosRef.current.forEach((audio, peerId) => {
        stopRemoteAudio(peerId)
      })

      // 关闭麦克风
      disableMicrophone()

      // 等待一下再重新启用
      setTimeout(async () => {
        const stream = await enableMicrophone(deviceId)

        if (stream) {
          const playersInRoom = playersInRooms.get(currentVoiceRoom)
          if (playersInRoom && playersInRoom.size > 0) {
            const myPeerId = connectionManager.getPeerId()
            playersInRoom.forEach(peerId => {
              if (peerId !== myPeerId) {
                connectionManager.callPeer(peerId, stream)
              }
            })
          }
        }
      }, 200)
    }
  }

  // ==================== 事件订阅 ====================

  // 订阅远程音频流事件
  useEffect(() => {
    const unsubscribe = connectionManager.onRemoteStream((peerId, stream) => {
      playRemoteAudio(peerId, stream)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // 订阅来电事件
  useEffect(() => {
    const unsubscribe = connectionManager.onCall((call) => {
      const localStream = connectionManager.getLocalStream()
      if (localStream) {
        connectionManager.answerCall(call, localStream)
      } else {
        call.close()
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // 订阅语音室更新消息
  useEffect(() => {
    const unsubscribe = connectionManager.onData((data, fromPeerId) => {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data

        // 只处理语音室更新消息
        if (parsed.type && (parsed.type === 'voice-join' || parsed.type === 'voice-leave')) {
          const update = parsed as VoiceRoomUpdate
          console.log('🎤 收到语音更新:', update.type, 'from', fromPeerId, 'room', update.roomId)

          if (update.type === 'voice-join') {
            // 更新房间内玩家列表
            addPlayerToRoom(update.roomId, fromPeerId)

            // 如果我也在同一个房间，呼叫这个玩家
            const localStream = connectionManager.getLocalStream()
            if (currentVoiceRoom === update.roomId && localStream) {
              connectionManager.callPeer(fromPeerId, localStream)
            }
          } else if (update.type === 'voice-leave') {
            // 更新房间内玩家列表
            removePlayerFromRoom(update.roomId, fromPeerId)

            // 挂断与这个玩家的通话
            connectionManager.closeCall(fromPeerId)
            stopRemoteAudio(fromPeerId)
          }
        }
      } catch (error) {
        console.error('处理语音数据失败:', error)
      }
    })

    return () => {
      unsubscribe()
    }
  }, [currentVoiceRoom])

  // 监听语音室变化，自动进入/离开
  useEffect(() => {
    const handleRoomChange = async () => {
      const oldRoom = prevRoomRef.current
      const newRoom = currentVoiceRoom

      if (oldRoom === newRoom) return

      console.log('🎤 VoicePanel 检测到语音室变化:', oldRoom, '->', newRoom)

      // 离开旧房间
      if (oldRoom) {
        await handleLeaveVoiceRoom(oldRoom)
      }

      // 进入新房间
      if (newRoom) {
        await handleEnterVoiceRoom(newRoom)
      }

      prevRoomRef.current = newRoom
    }

    handleRoomChange()

    return () => {
      // 组件卸载时清理
      if (prevRoomRef.current) {
        handleLeaveVoiceRoom(prevRoomRef.current)
      }
    }
  }, [currentVoiceRoom])

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
                loadAudioDevices()
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
                      setSelectedDeviceId(device.deviceId)
                      setShowDeviceSelector(false)
                      await handleDeviceChange(device.deviceId)
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

