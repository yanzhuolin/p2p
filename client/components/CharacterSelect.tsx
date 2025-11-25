import { useState } from 'react'
import { Character, CHARACTERS } from '../types/game'
import styles from '../styles/CharacterSelect.module.css'

interface CharacterSelectProps {
  onSelect: (character: Character) => void
}

export default function CharacterSelect({ onSelect }: CharacterSelectProps) {
  const [selectedCharacter, setSelectedCharacter] = useState<Character>(CHARACTERS[0])
  const [hoveredCharacter, setHoveredCharacter] = useState<Character | null>(null)

  const handleSelect = () => {
    onSelect(selectedCharacter)
  }

  return (
    <div className={styles.container}>
      <div className={styles.modal}>
        <h2 className={styles.title}>🎮 选择你的角色</h2>
        <p className={styles.subtitle}>选择一个角色进入游戏世界</p>

        <div className={styles.characterGrid}>
          {CHARACTERS.map((character) => (
            <div
              key={character.id}
              className={`${styles.characterCard} ${
                selectedCharacter.id === character.id ? styles.selected : ''
              }`}
              onClick={() => setSelectedCharacter(character)}
              onMouseEnter={() => setHoveredCharacter(character)}
              onMouseLeave={() => setHoveredCharacter(null)}
            >
              <div
                className={styles.characterAvatar}
                style={{
                  backgroundColor: character.color,
                  transform:
                    selectedCharacter.id === character.id
                      ? 'scale(1.1)'
                      : hoveredCharacter?.id === character.id
                      ? 'scale(1.05)'
                      : 'scale(1)'
                }}
              >
                <span className={styles.emoji}>{character.emoji}</span>
              </div>
              <div className={styles.characterName}>{character.name}</div>
            </div>
          ))}
        </div>

        <div className={styles.preview}>
          <div className={styles.previewTitle}>当前选择</div>
          <div className={styles.previewContent}>
            <div
              className={styles.previewAvatar}
              style={{ backgroundColor: selectedCharacter.color }}
            >
              <span className={styles.previewEmoji}>{selectedCharacter.emoji}</span>
            </div>
            <div className={styles.previewInfo}>
              <div className={styles.previewName}>{selectedCharacter.name}</div>
              <div className={styles.previewColor}>
                颜色: <span style={{ color: selectedCharacter.color }}>{selectedCharacter.color}</span>
              </div>
            </div>
          </div>
        </div>

        <button className={styles.confirmButton} onClick={handleSelect}>
          ✨ 确认选择并进入游戏
        </button>
      </div>
    </div>
  )
}

