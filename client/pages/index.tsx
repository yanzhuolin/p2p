import { useState, useEffect, useRef } from 'react'
import Peer, { DataConnection, MediaConnection } from 'peerjs'
import GameWorld from '../components/GameWorld'
import CharacterSelect from '../components/CharacterSelect'
import ChatPanel from '../components/ChatPanel'
import { Character, Player, Position, PlayerUpdate, GAME_CONFIG, CHARACTERS, VoiceRoomUpdate } from '@/types/game'
import { useChatStore, Message } from '@/store/chatStore'
import styles from '../styles/Game.module.css'

interface OnlineUser {
  peerId: string
  username: string
}

// 使用当前主机名，支持 localhost 和 IP 访问
const SIGNALING_SERVER = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
const SIGNALING_PORT = 9000
const API_SERVER = typeof window !== 'undefined' ? `https://${window.location.hostname}:3001` : 'https://localhost:3001'

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
  const addMessage = useChatStore((state) => state.addMessage)
  const clearMessages = useChatStore((state) => state.clearMessages)
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])
  const [connections, setConnections] = useState<Map<string, DataConnection>>(new Map())

  // 语音状态
  const [currentVoiceRoom, setCurrentVoiceRoom] = useState<string | null>(null)
  const [isMicEnabled, setIsMicEnabled] = useState(false)
  const [playersInRooms, setPlayersInRooms] = useState<Map<string, Set<string>>>(new Map())
  const [playerMicStatus, setPlayerMicStatus] = useState<Map<string, { enabled: boolean, muted: boolean }>>(new Map())
  const [showVoicePanel, setShowVoicePanel] = useState(true)
  const [playerVolumes, setPlayerVolumes] = useState<Map<string, number>>(new Map())
  const [myVolume, setMyVolume] = useState(0)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')
  const [showDeviceSelector, setShowDeviceSelector] = useState(false)

  // Refs
  const peerRef = useRef<Peer | null>(null)
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map())
  const userListIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const myPlayerRef = useRef<Player | null>(null)

  // 语音相关 Refs
  const localStreamRef = useRef<MediaStream | null>(null)
  const voiceCallsRef = useRef<Map<string, MediaConnection>>(new Map())
  const remoteAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const audioAnalyzersRef = useRef<Map<string, AnalyserNode>>(new Map())
  const localAnalyzerRef = useRef<AnalyserNode | null>(null)
  const volumeIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const myVolumeIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map())

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

  // 广播语音室更新
  const broadcastVoiceUpdate = (update: VoiceRoomUpdate) => {
    const message = JSON.stringify(update)
    connectionsRef.current.forEach((conn, peerId) => {
      if (conn.open) {
        try {
          conn.send(message)
        } catch (error) {
          console.error(`发送语音更新失败 (${peerId}):`, error)
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

      localStreamRef.current = stream
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
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
      setIsMicEnabled(false)
      console.log('🎤 麦克风已关闭')
    }

    // 停止本地音量监听
    stopVolumeMonitoring(null)
  }

  // 呼叫语音室内的其他玩家
  const callPeer = async (peerId: string, stream: MediaStream) => {
    if (!peerRef.current) return

    try {
      const call = peerRef.current.call(peerId, stream)

      call.on('stream', (remoteStream) => {
        playRemoteAudio(peerId, remoteStream)
      })

      call.on('close', () => {
        stopRemoteAudio(peerId)
      })

      call.on('error', (error) => {
        console.error('通话错误:', peerId, error)
      })

      voiceCallsRef.current.set(peerId, call)
    } catch (error) {
      console.error('呼叫失败:', peerId, error)
    }
  }

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

  // 处理语音室变化
  const handleVoiceRoomChange = async (newRoomId: string | null) => {
    const oldRoomId = currentVoiceRoom

    if (oldRoomId === newRoomId) return

    console.log('🚪 语音室变化:', oldRoomId, '->', newRoomId)

    // 离开旧房间
    if (oldRoomId) {
      const leaveUpdate: VoiceRoomUpdate = {
        type: 'voice-leave',
        peerId: peerRef.current?.id || '',
        roomId: oldRoomId,
        timestamp: Date.now()
      }
      broadcastVoiceUpdate(leaveUpdate)

      voiceCallsRef.current.forEach((call, peerId) => {
        call.close()
        stopRemoteAudio(peerId)
      })
      voiceCallsRef.current.clear()

      disableMicrophone()
    }

    setCurrentVoiceRoom(newRoomId)

    // 进入新房间
    if (newRoomId) {
      const { selectedDevice } = await loadAudioDevices()

      const permissionState = await checkMicrophonePermission()

      if (permissionState === 'denied') {
        alert('麦克风权限已被拒绝\n\n请按以下步骤操作：\n1. 点击地址栏左侧的图标（锁或信息图标）\n2. 找到"麦克风"权限\n3. 设置为"允许"\n4. 刷新页面后重新进入语音室')
        setCurrentVoiceRoom(null)
        return
      }

      const stream = await enableMicrophone(selectedDevice || undefined)
      if (!stream) {
        setCurrentVoiceRoom(null)
        return
      }

      // 把自己加入到房间列表
      setPlayersInRooms(prev => {
        const newMap = new Map(prev)
        const roomPlayers = newMap.get(newRoomId) || new Set()
        roomPlayers.add(peerRef.current?.id || '')
        newMap.set(newRoomId, roomPlayers)
        return newMap
      })

      const joinUpdate: VoiceRoomUpdate = {
        type: 'voice-join',
        peerId: peerRef.current?.id || '',
        roomId: newRoomId,
        timestamp: Date.now()
      }
      broadcastVoiceUpdate(joinUpdate)

      const playersInRoom = playersInRooms.get(newRoomId)
      if (playersInRoom && playersInRoom.size > 0) {
        playersInRoom.forEach(peerId => {
          if (peerId !== peerRef.current?.id) {
            callPeer(peerId, stream)
          }
        })
      }
    }
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
      if (parsed.type && (parsed.type === 'join' || parsed.type === 'position' || parsed.type === 'leave')) {
        handleGameUpdate(parsed as PlayerUpdate, fromPeerId)
      }
      // 语音室更新
      else if (parsed.type && (parsed.type === 'voice-join' || parsed.type === 'voice-leave')) {
        handleVoiceUpdate(parsed as VoiceRoomUpdate, fromPeerId)
      }
      // 聊天消息
      else if (parsed.text) {
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
      console.error('处理数据失败:', error)
    }
  }

  // 处理语音室更新
  const handleVoiceUpdate = async (update: VoiceRoomUpdate, fromPeerId: string) => {
    console.log('🎤 收到语音更新:', update.type, 'from', fromPeerId, 'room', update.roomId)

    if (update.type === 'voice-join') {
      // 更新房间内玩家列表
      setPlayersInRooms(prev => {
        const newMap = new Map(prev)
        const roomPlayers = newMap.get(update.roomId) || new Set()
        roomPlayers.add(fromPeerId)
        newMap.set(update.roomId, roomPlayers)
        return newMap
      })

      // 如果我也在同一个房间，呼叫这个玩家
      if (currentVoiceRoom === update.roomId && localStreamRef.current) {
        callPeer(fromPeerId, localStreamRef.current)
      }
    } else if (update.type === 'voice-leave') {
      // 更新房间内玩家列表
      setPlayersInRooms(prev => {
        const newMap = new Map(prev)
        const roomPlayers = newMap.get(update.roomId)
        if (roomPlayers) {
          roomPlayers.delete(fromPeerId)
          if (roomPlayers.size === 0) {
            newMap.delete(update.roomId)
          } else {
            newMap.set(update.roomId, roomPlayers)
          }
        }
        return newMap
      })

      // 挂断与这个玩家的通话
      const call = voiceCallsRef.current.get(fromPeerId)
      if (call) {
        call.close()
        voiceCallsRef.current.delete(fromPeerId)
      }
      stopRemoteAudio(fromPeerId)
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

    // 接收语音呼叫
    peer.on('call', (call) => {
      console.log('📞 收到语音呼叫来自:', call.peer)
      console.log('📞 当前本地音频流状态:', localStreamRef.current ? '已启用' : '未启用')

      // 如果有本地音频流，接听
      if (localStreamRef.current) {
        console.log('📞 接听呼叫，发送本地音频流')
        console.log('📞 本地音频流:', {
          id: localStreamRef.current.id,
          active: localStreamRef.current.active,
          audioTracks: localStreamRef.current.getAudioTracks().length,
          trackEnabled: localStreamRef.current.getAudioTracks()[0]?.enabled
        })

        call.answer(localStreamRef.current)

        call.on('stream', (remoteStream) => {
          console.log('🔊 [接听方] 收到对方音频流:', call.peer)
          playRemoteAudio(call.peer, remoteStream)
        })

        call.on('close', () => {
          console.log('📞 通话结束:', call.peer)
          stopRemoteAudio(call.peer)
        })

        call.on('error', (error) => {
          console.error('❌ [接听方] 通话错误:', call.peer, error)
        })

        voiceCallsRef.current.set(call.peer, call)
        console.log('✅ 已接听呼叫:', call.peer)
      } else {
        console.log('⚠️ 没有本地音频流，拒绝呼叫')
        call.close()
      }
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

          // 如果我在语音室内，也发送语音室状态
          if (currentVoiceRoom) {
            const voiceUpdate: VoiceRoomUpdate = {
              type: 'voice-join',
              peerId: myPlayerRef.current.peerId,
              roomId: currentVoiceRoom,
              timestamp: Date.now()
            }
            conn.send(JSON.stringify(voiceUpdate))
          }
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

        // 清理语音通话
        const call = voiceCallsRef.current.get(conn.peer)
        if (call) {
          call.close()
          voiceCallsRef.current.delete(conn.peer)
        }
        stopRemoteAudio(conn.peer)
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
  const sendMessage = (text: string) => {
    if (!text.trim()) return

    const message: Message = {
      id: `${Date.now()}-${Math.random()}`,
      peerId: myPeerId,
      username: username,
      text: text,
      timestamp: Date.now()
    }

    addMessage(message)

    const messageData = {
      id: message.id,
      text: message.text,
      username: message.username,
      timestamp: message.timestamp
    }

    connectionsRef.current.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(JSON.stringify(messageData))
        } catch (error) {
          console.error('发送消息失败:', error)
        }
      }
    })
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

    // 清理语音资源
    voiceCallsRef.current.forEach((call) => {
      try {
        call.close()
      } catch (error) {
        console.error('关闭语音通话失败:', error)
      }
    })
    voiceCallsRef.current.clear()

    remoteAudiosRef.current.forEach((audio) => {
      try {
        audio.pause()
        audio.srcObject = null
      } catch (error) {
        console.error('清理音频失败:', error)
      }
    })
    remoteAudiosRef.current.clear()

    // 清理所有音量监听
    audioAnalyzersRef.current.forEach((processor) => {
      try {
        processor.disconnect()
      } catch (e) {}
    })
    audioAnalyzersRef.current.clear()

    audioSourcesRef.current.forEach((source) => {
      try {
        source.disconnect()
      } catch (e) {}
    })
    audioSourcesRef.current.clear()

    // 关闭 AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    disableMicrophone()

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
    clearMessages()
    setOnlineUsers([])
    setMyPlayer(null)
    myPlayerRef.current = null
    setOtherPlayers(new Map())
    setSelectedCharacter(null)
    setCurrentVoiceRoom(null)
    setPlayersInRooms(new Map())

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
          {currentVoiceRoom && (
            <span className={styles.voiceStatus}>
              🎤 {isMicEnabled ? '开启' : '关闭'}
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
          {myPlayer && (
            <GameWorld
              myPlayer={myPlayer}
              otherPlayers={otherPlayers}
              onPositionUpdate={handlePositionUpdate}
              onVoiceRoomChange={handleVoiceRoomChange}
              currentVoiceRoom={currentVoiceRoom}
              playersInRooms={playersInRooms}
            />
          )}
        </div>

        {/* 语音室面板 */}
        {currentVoiceRoom && (
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

                            // 如果麦克风已启用，重新启用以使用新设备
                            if (isMicEnabled && currentVoiceRoom) {
                              voiceCallsRef.current.forEach((call, peerId) => {
                                call.close()
                                stopRemoteAudio(peerId)
                              })
                              voiceCallsRef.current.clear()

                              disableMicrophone()

                              setTimeout(async () => {
                                const stream = await enableMicrophone(device.deviceId)

                                if (stream) {
                                  const playersInRoom = playersInRooms.get(currentVoiceRoom)
                                  if (playersInRoom && playersInRoom.size > 0) {
                                    playersInRoom.forEach(peerId => {
                                      if (peerId !== peerRef.current?.id) {
                                        callPeer(peerId, stream)
                                      }
                                    })
                                  }
                                }
                              }, 200)
                            }
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
        )}

        {/* 聊天面板 */}
        <ChatPanel myPeerId={myPeerId} onSendMessage={sendMessage} />
      </div>
    </div>
  )
}

