import Peer, {DataConnection, MediaConnection} from 'peerjs'

type ConnectionChangeCallback = (connections: Map<string, DataConnection>) => void
type PeerIdChangeCallback = (peerId: string) => void
type DataCallback = (data: any, fromPeerId: string) => void
type PlayerRemovedCallback = (peerId: string) => void
type CallCallback = (call: MediaConnection) => void
type RemoteStreamCallback = (peerId: string, stream: MediaStream) => void

/**
 * 连接管理单例类
 * 管理 Peer 连接、DataConnection 和相关状态
 */
class ConnectionManager {
  private static instance: ConnectionManager | null = null

  private peer: Peer | null = null
  private peerId: string = ''
  private connections: Map<string, DataConnection> = new Map()

  // 心跳相关
  private heartbeatInterval: NodeJS.Timeout | null = null
  private apiServerUrl: string = ''

  // 语音通话相关
  private localStream: MediaStream | null = null
  private voiceCalls: Map<string, MediaConnection> = new Map()

  // 回调函数
  private connectionChangeCallbacks: Set<ConnectionChangeCallback> = new Set()
  private peerIdChangeCallbacks: Set<PeerIdChangeCallback> = new Set()
  private dataCallbacks: Set<DataCallback> = new Set()
  private playerRemovedCallbacks: Set<PlayerRemovedCallback> = new Set()
  private callCallbacks: Set<CallCallback> = new Set()
  private remoteStreamCallbacks: Set<RemoteStreamCallback> = new Set()

  private constructor() {
    // 私有构造函数，防止外部实例化
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager()
    }
    return ConnectionManager.instance
  }

  /**
   * 重置单例（用于测试或完全重置）
   */
  public static resetInstance(): void {
    if (ConnectionManager.instance) {
      ConnectionManager.instance.destroy()
      ConnectionManager.instance = null
    }
  }

  /**
   * 获取 Peer 对象
   */
  public getPeer(): Peer | null {
    return this.peer
  }

  /**
   * 设置 Peer 对象
   */
  public setPeer(peer: Peer | null): void {
    this.peer = peer
  }

  /**
   * 获取 Peer ID
   */
  public getPeerId(): string {
    return this.peerId
  }

  /**
   * 设置 Peer ID
   */
  public setPeerId(peerId: string): void {
    this.peerId = peerId
    this.notifyPeerIdChange(peerId)
  }

  /**
   * 获取所有连接
   */
  public getConnections(): Map<string, DataConnection> {
    return this.connections
  }

  /**
   * 获取指定的连接
   */
  public getConnection(peerId: string): DataConnection | undefined {
    return this.connections.get(peerId)
  }

  /**
   * 检查是否存在指定连接
   */
  public hasConnection(peerId: string): boolean {
    return this.connections.has(peerId)
  }

  /**
   * 添加或更新连接
   */
  public setConnection(peerId: string, connection: DataConnection): void {
    this.connections.set(peerId, connection)
    this.notifyConnectionChange()
  }

  /**
   * 移除连接
   */
  public removeConnection(peerId: string): void {
    this.connections.delete(peerId)
    this.notifyConnectionChange()
  }

  /**
   * 清空所有连接
   */
  public clearConnections(): void {
    this.connections.clear()
    this.notifyConnectionChange()
  }

  /**
   * 广播消息到所有连接
   */
  public broadcast(message: string): void {
    this.connections.forEach((conn, peerId) => {
      if (conn.open) {
        try {
          conn.send(message)
        } catch (error) {
          console.error(`发送消息失败 (${peerId}):`, error)
        }
      }
    })
  }

  /**
   * 发送消息到指定连接
   */
  public sendTo(peerId: string, message: string): boolean {
    const conn = this.connections.get(peerId)
    if (conn && conn.open) {
      try {
        conn.send(message)
        return true
      } catch (error) {
        console.error(`发送消息失败 (${peerId}):`, error)
        return false
      }
    }
    return false
  }

  /**
   * 关闭所有连接
   */
  public closeAllConnections(): void {
    this.connections.forEach((conn) => {
      try {
        conn.close()
      } catch (error) {
        // 忽略错误
      }
    })
    this.clearConnections()
  }

  /**
   * 设置 API 服务器 URL
   */
  public setApiServerUrl(url: string): void {
    this.apiServerUrl = url
  }

  /**
   * 发送心跳到 API 服务器
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.peerId || !this.peer || this.peer.destroyed || !this.apiServerUrl) {
      return
    }

    try {
      await fetch(`${this.apiServerUrl}/api/heartbeat`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({peerId: this.peerId}),
        signal: AbortSignal.timeout(3000)
      })
    } catch (error) {
      // 忽略心跳错误
    }
  }

  /**
   * 启动心跳
   */
  public startHeartbeat(intervalMs: number = 10000): void {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), intervalMs)
    this.sendHeartbeat() // 立即发送一次
  }

  /**
   * 停止心跳
   */
  public stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  /**
   * 销毁 Peer 和所有连接
   */
  public destroy(): void {
    this.stopHeartbeat()
    this.closeAllConnections()

    if (this.peer) {
      try {
        this.peer.destroy()
      } catch (error) {
        console.error('销毁 Peer 失败:', error)
      }
      this.peer = null
    }

    this.peerId = ''
    this.apiServerUrl = ''
    this.connectionChangeCallbacks.clear()
    this.peerIdChangeCallbacks.clear()
    this.dataCallbacks.clear()
    this.playerRemovedCallbacks.clear()
  }

  /**
   * 订阅连接变化
   */
  public onConnectionChange(callback: ConnectionChangeCallback): () => void {
    this.connectionChangeCallbacks.add(callback)
    // 返回取消订阅函数
    return () => {
      this.connectionChangeCallbacks.delete(callback)
    }
  }

  /**
   * 订阅 Peer ID 变化
   */
  public onPeerIdChange(callback: PeerIdChangeCallback): () => void {
    this.peerIdChangeCallbacks.add(callback)
    // 返回取消订阅函数
    return () => {
      this.peerIdChangeCallbacks.delete(callback)
    }
  }

  /**
   * 通知连接变化
   */
  private notifyConnectionChange(): void {
    const connections = new Map(this.connections)
    this.connectionChangeCallbacks.forEach(callback => {
      try {
        callback(connections)
      } catch (error) {
        console.error('连接变化回调执行失败:', error)
      }
    })
  }

  /**
   * 通知 Peer ID 变化
   */
  private notifyPeerIdChange(peerId: string): void {
    this.peerIdChangeCallbacks.forEach(callback => {
      try {
        callback(peerId)
      } catch (error) {
        console.error('Peer ID 变化回调执行失败:', error)
      }
    })
  }

  /**
   * 订阅数据接收
   */
  public onData(callback: DataCallback): () => void {
    this.dataCallbacks.add(callback)
    return () => {
      this.dataCallbacks.delete(callback)
    }
  }

  /**
   * 订阅玩家移除事件
   */
  public onPlayerRemoved(callback: PlayerRemovedCallback): () => void {
    this.playerRemovedCallbacks.add(callback)
    return () => {
      this.playerRemovedCallbacks.delete(callback)
    }
  }

  /**
   * 触发数据回调
   */
  private notifyDataCallbacks(data: any, fromPeerId: string): void {
    this.dataCallbacks.forEach(callback => callback(data, fromPeerId))
  }

  /**
   * 触发玩家移除回调
   */
  private notifyPlayerRemovedCallbacks(peerId: string): void {
    this.playerRemovedCallbacks.forEach(callback => callback(peerId))
  }

  /**
   * 连接到其他 Peer
   */
  public connectToPeer(
    peerId: string,
    onConnected?: (peerId: string) => void
  ): void {
    if (!this.peer || this.peer.destroyed) {
      console.warn('Peer 未初始化或已销毁')
      return
    }

    if (this.connections.has(peerId)) {
      console.log('已存在连接:', peerId)
      return
    }

    console.log('🔗 正在连接到:', peerId)

    try {
      const conn = this.peer.connect(peerId, {
        reliable: true,
        serialization: 'json'
      })

      const timeoutId = setTimeout(() => {
        if (!conn.open) {
          console.log('⏱️ 连接超时:', peerId)
          conn.close()
        }
      }, 10000)

      conn.on('open', () => {
        clearTimeout(timeoutId)
        console.log('✅ 已连接到:', peerId)
        this.setConnection(peerId, conn)
        onConnected?.(peerId)
      })

      conn.on('data', (data) => {
        this.notifyDataCallbacks(data, peerId)
      })

      conn.on('close', () => {
        console.log('❌ 连接关闭:', peerId)
        this.removeConnection(peerId)
        this.notifyPlayerRemovedCallbacks(peerId)
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

  /**
   * 初始化 Peer 并设置事件监听
   */
  public initializePeer(
    config: {
      host: string
      port: number
      path: string
      secure?: boolean
      debug?: number
      apiServerUrl?: string
      heartbeatInterval?: number
      config?: RTCConfiguration
    },
    callbacks: {
      onOpen?: (id: string) => void
      onCall?: (call: MediaConnection) => void
      onConnection?: (conn: DataConnection) => void
      onError?: (err: Error) => void
    }
  ): void {
    console.log('🔗 正在初始化 Peer...', config)

    // 提取自定义参数
    const { apiServerUrl, heartbeatInterval, ...peerConfig } = config

    const peer = new Peer(peerConfig)

    // 设置 API 服务器 URL
    if (config.apiServerUrl) {
      this.setApiServerUrl(config.apiServerUrl)
    }

    peer.on('open', (id) => {
      console.log('✅ Peer 已打开:', id)
      this.setPeerId(id)
      this.setPeer(peer)

      // 自动启动心跳
      if (this.apiServerUrl) {
        this.startHeartbeat(config.heartbeatInterval || 10000)
      }

      callbacks.onOpen?.(id)
    })

    peer.on('call', (call) => {
      // 触发内部的来电回调
      this.notifyCallCallbacks(call)
      // 同时保留外部回调（向后兼容）
      callbacks.onCall?.(call)
    })

    peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.setConnection(conn.peer, conn)
        callbacks.onConnection?.(conn)
      })

      conn.on('data', (data) => {
        this.notifyDataCallbacks(data, conn.peer)
      })

      conn.on('close', () => {
        this.removeConnection(conn.peer)
        this.notifyPlayerRemovedCallbacks(conn.peer)
      })

      conn.on('error', (err) => {
        console.error('连接错误:', conn.peer, err)
      })
    })

    peer.on('error', (err) => {
      console.error('Peer错误:', err)
      callbacks.onError?.(err)
    })
  }

  /**
   * ==================== 语音通话管理 ====================
   */

  /**
   * 设置本地音频流
   */
  public setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream
  }

  /**
   * 获取本地音频流
   */
  public getLocalStream(): MediaStream | null {
    return this.localStream
  }

  /**
   * 呼叫其他玩家
   */
  public async callPeer(peerId: string, stream: MediaStream): Promise<void> {
    if (!this.peer) {
      console.error('Peer 未初始化')
      return
    }

    try {
      const call = this.peer.call(peerId, stream)

      call.on('stream', (remoteStream) => {
        console.log('📞 收到远程音频流:', peerId)
        this.notifyRemoteStreamCallbacks(peerId, remoteStream)
      })

      call.on('close', () => {
        console.log('📞 通话关闭:', peerId)
        this.voiceCalls.delete(peerId)
      })

      call.on('error', (error) => {
        console.error('通话错误:', peerId, error)
        this.voiceCalls.delete(peerId)
      })

      this.voiceCalls.set(peerId, call)
      console.log('📞 呼叫玩家:', peerId)
    } catch (error) {
      console.error('呼叫失败:', peerId, error)
    }
  }

  /**
   * 接听来电
   */
  public answerCall(call: MediaConnection, stream: MediaStream): void {
    call.answer(stream)

    call.on('stream', (remoteStream) => {
      console.log('📞 收到远程音频流:', call.peer)
      this.notifyRemoteStreamCallbacks(call.peer, remoteStream)
    })

    call.on('close', () => {
      console.log('📞 通话关闭:', call.peer)
      this.voiceCalls.delete(call.peer)
    })

    call.on('error', (error) => {
      console.error('通话错误:', call.peer, error)
      this.voiceCalls.delete(call.peer)
    })

    this.voiceCalls.set(call.peer, call)
    console.log('📞 接听来电:', call.peer)
  }

  /**
   * 关闭与指定玩家的通话
   */
  public closeCall(peerId: string): void {
    const call = this.voiceCalls.get(peerId)
    if (call) {
      try {
        call.close()
      } catch (error) {
        console.error('关闭通话失败:', peerId, error)
      }
      this.voiceCalls.delete(peerId)
    }
  }

  /**
   * 关闭所有通话
   */
  public closeAllCalls(): void {
    this.voiceCalls.forEach((call, peerId) => {
      try {
        call.close()
      } catch (error) {
        console.error('关闭通话失败:', peerId, error)
      }
    })
    this.voiceCalls.clear()
    console.log('📞 已关闭所有通话')
  }

  /**
   * 获取指定的通话
   */
  public getVoiceCall(peerId: string): MediaConnection | undefined {
    return this.voiceCalls.get(peerId)
  }

  /**
   * 检查是否存在指定通话
   */
  public hasVoiceCall(peerId: string): boolean {
    return this.voiceCalls.has(peerId)
  }

  /**
   * 获取所有通话
   */
  public getVoiceCalls(): Map<string, MediaConnection> {
    return this.voiceCalls
  }

  /**
   * 订阅来电事件
   */
  public onCall(callback: CallCallback): () => void {
    this.callCallbacks.add(callback)
    return () => {
      this.callCallbacks.delete(callback)
    }
  }

  /**
   * 订阅远程音频流事件
   */
  public onRemoteStream(callback: RemoteStreamCallback): () => void {
    this.remoteStreamCallbacks.add(callback)
    return () => {
      this.remoteStreamCallbacks.delete(callback)
    }
  }

  /**
   * 通知来电回调
   */
  private notifyCallCallbacks(call: MediaConnection): void {
    this.callCallbacks.forEach(callback => {
      try {
        callback(call)
      } catch (error) {
        console.error('来电回调执行失败:', error)
      }
    })
  }

  /**
   * 通知远程音频流回调
   */
  private notifyRemoteStreamCallbacks(peerId: string, stream: MediaStream): void {
    this.remoteStreamCallbacks.forEach(callback => {
      try {
        callback(peerId, stream)
      } catch (error) {
        console.error('远程音频流回调执行失败:', error)
      }
    })
  }

  /**
   * 触发来电回调（需要在 initializePeer 的 onCall 中调用）
   */
  public triggerCallCallback(call: MediaConnection): void {
    this.notifyCallCallbacks(call)
  }
}

export default ConnectionManager

