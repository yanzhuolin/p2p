// 游戏相关类型定义

export interface Character {
  id: string
  name: string
  color: string
  shape: 'circle' | 'square' | 'triangle' | 'star'
  emoji?: string
}

export interface Player {
  peerId: string
  username: string
  character: Character
  position: Position
  velocity: Velocity
  lastUpdate: number
}

export interface Position {
  x: number
  y: number
}

export interface Velocity {
  x: number
  y: number
}

export interface GameState {
  players: Map<string, Player>
  timestamp: number
}

export interface PlayerUpdate {
  type: 'position' | 'character' | 'join' | 'leave'
  peerId: string
  username?: string
  character?: Character
  position?: Position
  velocity?: Velocity
  timestamp: number
}

// 预定义的角色
export const CHARACTERS: Character[] = [
  {
    id: 'knight',
    name: '骑士',
    color: '#3b82f6',
    shape: 'circle',
    emoji: '🛡️'
  },
  {
    id: 'mage',
    name: '法师',
    color: '#8b5cf6',
    shape: 'circle',
    emoji: '🔮'
  },
  {
    id: 'archer',
    name: '弓箭手',
    color: '#10b981',
    shape: 'circle',
    emoji: '🏹'
  },
  {
    id: 'warrior',
    name: '战士',
    color: '#ef4444',
    shape: 'circle',
    emoji: '⚔️'
  },
  {
    id: 'rogue',
    name: '刺客',
    color: '#6366f1',
    shape: 'circle',
    emoji: '🗡️'
  },
  {
    id: 'paladin',
    name: '圣骑士',
    color: '#f59e0b',
    shape: 'circle',
    emoji: '✨'
  },
  {
    id: 'druid',
    name: '德鲁伊',
    color: '#84cc16',
    shape: 'circle',
    emoji: '🌿'
  },
  {
    id: 'necromancer',
    name: '死灵法师',
    color: '#a855f7',
    shape: 'circle',
    emoji: '💀'
  }
]

// 语音室类型
export interface VoiceRoom {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color: string
  borderColor: string
  maxPlayers?: number
}

// 语音室更新消息
export interface VoiceRoomUpdate {
  type: 'voice-join' | 'voice-leave'
  peerId: string
  roomId: string
  timestamp: number
}

// 游戏配置
export const GAME_CONFIG = {
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 600,
  PLAYER_SIZE: 40,
  PLAYER_SPEED: 5,
  UPDATE_INTERVAL: 16, // ~60 FPS
  SYNC_INTERVAL: 50, // 每50ms同步一次位置
  MAP_GRID_SIZE: 50,
  COLLISION_ENABLED: true
}

// 预定义的语音室
export const VOICE_ROOMS: VoiceRoom[] = [
  {
    id: 'room1',
    name: '🎤 语音室 1',
    x: 50,
    y: 50,
    width: 200,
    height: 150,
    color: 'rgba(59, 130, 246, 0.2)', // 蓝色
    borderColor: '#3b82f6',
  },
  {
    id: 'room2',
    name: '🎵 语音室 2',
    x: 550,
    y: 50,
    width: 200,
    height: 150,
    color: 'rgba(139, 92, 246, 0.2)', // 紫色
    borderColor: '#8b5cf6',
  },
  {
    id: 'room3',
    name: '🎧 语音室 3',
    x: 50,
    y: 400,
    width: 200,
    height: 150,
    color: 'rgba(16, 185, 129, 0.2)', // 绿色
    borderColor: '#10b981',
  },
  {
    id: 'room4',
    name: '🔊 语音室 4',
    x: 550,
    y: 400,
    width: 200,
    height: 150,
    color: 'rgba(245, 158, 11, 0.2)', // 橙色
    borderColor: '#f59e0b',
  },
]

