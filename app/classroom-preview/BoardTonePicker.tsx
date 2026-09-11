import { boardTones, boardToneStyle, type BoardTone } from './board-tones';
import './board-tones.css';

export function BoardTonePicker({ selected, onChange }: { selected: BoardTone; onChange: (tone: BoardTone) => void }) {
  return <details className="board-tone-picker">
    <summary>黑板底色 · {selected.label}</summary>
    <div className="board-tone-popover">
      <div className="board-tone-options" role="group" aria-label="黑板底色对比">
        {boardTones.map(tone => <button key={tone.id} type="button" className="board-tone-choice"
          style={boardToneStyle(tone)} aria-pressed={selected.id === tone.id} onClick={() => onChange(tone)}>
          <span className="board-tone-swatch" aria-hidden="true">Aa</span>
          <strong>{tone.label}</strong><small>{tone.description}</small>
        </button>)}
      </div>
    </div>
  </details>;
}
