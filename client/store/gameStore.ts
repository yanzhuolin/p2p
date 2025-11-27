import { create } from 'zustand'
import { Player } from '@/types/game'

interface GameState {
  myPlayer: Player | null
  otherPlayers: Map<string, Player>
  currentVoiceRoom: string | null
  playersInRooms: Map<string, Set<string>>
  
  // Actions
  setMyPlayer: (player: Player | null) => void
  updateMyPlayerPosition: (position: { x: number; y: number }, velocity: { x: number; y: number }) => void
  setOtherPlayer: (peerId: string, player: Player) => void
  removeOtherPlayer: (peerId: string) => void
  clearOtherPlayers: () => void
  setCurrentVoiceRoom: (roomId: string | null) => void
  addPlayerToRoom: (roomId: string, peerId: string) => void
  removePlayerFromRoom: (roomId: string, peerId: string) => void
  clearPlayersInRooms: () => void
  reset: () => void
}

export const useGameStore = create<GameState>((set) => ({
  myPlayer: null,
  otherPlayers: new Map(),
  currentVoiceRoom: null,
  playersInRooms: new Map(),

  setMyPlayer: (player) => set({ myPlayer: player }),

  updateMyPlayerPosition: (position, velocity) =>
    set((state) => {
      if (!state.myPlayer) return state
      return {
        myPlayer: {
          ...state.myPlayer,
          position,
          velocity,
          lastUpdate: Date.now()
        }
      }
    }),

  setOtherPlayer: (peerId, player) =>
    set((state) => {
      const newMap = new Map(state.otherPlayers)
      newMap.set(peerId, player)
      return { otherPlayers: newMap }
    }),

  removeOtherPlayer: (peerId) =>
    set((state) => {
      const newMap = new Map(state.otherPlayers)
      newMap.delete(peerId)
      return { otherPlayers: newMap }
    }),

  clearOtherPlayers: () => set({ otherPlayers: new Map() }),

  setCurrentVoiceRoom: (roomId) => set({ currentVoiceRoom: roomId }),

  addPlayerToRoom: (roomId, peerId) =>
    set((state) => {
      const newMap = new Map(state.playersInRooms)
      const roomPlayers = newMap.get(roomId) || new Set()
      roomPlayers.add(peerId)
      newMap.set(roomId, roomPlayers)
      return { playersInRooms: newMap }
    }),

  removePlayerFromRoom: (roomId, peerId) =>
    set((state) => {
      const newMap = new Map(state.playersInRooms)
      const roomPlayers = newMap.get(roomId)
      if (roomPlayers) {
        roomPlayers.delete(peerId)
        if (roomPlayers.size === 0) {
          newMap.delete(roomId)
        } else {
          newMap.set(roomId, roomPlayers)
        }
      }
      return { playersInRooms: newMap }
    }),

  clearPlayersInRooms: () => set({ playersInRooms: new Map() }),

  reset: () =>
    set({
      myPlayer: null,
      otherPlayers: new Map(),
      currentVoiceRoom: null,
      playersInRooms: new Map()
    })
}))

