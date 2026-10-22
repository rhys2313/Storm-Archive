import {
  Monitor,
  Sun,
  Moon,
  ArrowUpRight,
  HardDrive,
  SlidersHorizontal
} from 'lucide-react';
import Modal from './Modal';

const options = [
  {
    value: 'system',
    label: 'Как на устройстве',
    detail: 'Следовать системной теме',
    icon: Monitor
  },
  {
    value: 'light',
    label: 'Светлая',
    detail: 'Светлые поверхности и тёмный текст',
    icon: Sun
  },
  {
    value: 'dark',
    label: 'Тёмная',
    detail: 'Графитовые поверхности и светлый текст',
    icon: Moon
  }
];
export default function SettingsModal({
  preference,
  onThemeChange,
  saveError,
  onClose,
  onOpenBackup
}) {
  return (
    <Modal
      title="Настройки"
      titleIcon={<SlidersHorizontal size={20} aria-hidden="true" />}
      onClose={onClose}
      className="settings-modal"
      labelledBy="settings-title"
    >
      <fieldset className="appearance-options">
        <legend>Тема оформления</legend>
        <p className="settings-intro">
          Выбор применяется сразу и сохраняется на устройстве.
        </p>
        {options.map(({ value, label, detail, icon: Icon }) => (
          <label
            key={value}
            className={`appearance-option ${preference === value ? 'selected' : ''}`}
          >
            <Icon size={22} aria-hidden="true" />
            <span>
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <input
              type="radio"
              name="appearance"
              value={value}
              checked={preference === value}
              onChange={() => onThemeChange(value)}
            />
          </label>
        ))}
      </fieldset>
      {saveError && (
        <p className="inline-alert warning" role="status">
          {saveError}
        </p>
      )}
      <section className="settings-storage">
        <HardDrive size={24} aria-hidden="true" />
        <div>
          <h3>Ваш архив — на этом устройстве</h3>
          <p>
            Записи и снимки хранятся локально. Сохраните резервную копию для
            переноса или восстановления.
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={onOpenBackup}>
          Данные и резервные копии <ArrowUpRight size={16} aria-hidden="true" />
        </button>
      </section>
    </Modal>
  );
}
