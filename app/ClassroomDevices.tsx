"use client";
import { useRef, type ReactNode } from 'react';
import { Mic, MonitorUp, Video } from 'lucide-react';
import type { ClassroomProfile } from './classroom-members';

export function ActivityInput({ value, onChange, readOnly = false }: { value: string; onChange: (value: string) => void; readOnly?: boolean }) {
  const composing = useRef(false);
  const beforeComposition = useRef(value);
  const fits = (element: HTMLTextAreaElement) => element.scrollHeight <= element.clientHeight + 1;
  return <textarea aria-label="我正在" value={value} placeholder="正在…" rows={3} maxLength={80} readOnly={readOnly}
    onCompositionStart={() => { composing.current = true; beforeComposition.current = value; }}
    onCompositionEnd={event => {
      composing.current = false;
      const element = event.currentTarget;
      const next = fits(element) ? element.value : beforeComposition.current;
      element.value = next;
      onChange(next);
    }}
    onChange={event => {
      const element = event.currentTarget;
      if (composing.current || fits(element) || element.value.length < value.length) onChange(element.value);
      else element.value = value;
    }}
    onKeyDown={event => {
      if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      const input = event.currentTarget;
      input.form?.requestSubmit();
      input.blur();
    }} />;
}

export function DeviceIdentity({ name }: { name: string }) {
  return <div className="device-identity"><strong className="device-name" >{name}</strong></div>;
}

export function DeviceMediaControls({ screen, camera, microphone = false, self, onScreen, onCamera, onMicrophone }: {
  screen: boolean; camera: boolean; microphone?: boolean; self: boolean; onScreen?: () => void; onCamera?: () => void; onMicrophone?: () => void;
}) {
  return <div className="device-media-status" role="group" aria-label="投屏、视频与麦克风">
    <button type="button" className={screen ? 'is-live' : ''} onClick={onScreen} disabled={!onScreen}  aria-label={screen ? '投屏中' : '开启投屏'} aria-pressed={screen}>{screen ? <span>投屏中</span> : <MonitorUp aria-hidden="true" />}</button>
    <button type="button" className={camera ? 'is-live' : ''} onClick={onCamera} disabled={!onCamera}  aria-label={camera ? '视频中' : '开启视频'} aria-pressed={camera}>{camera ? <span>视频中</span> : <Video aria-hidden="true" />}</button>
    <button type="button" className={microphone ? 'is-live' : ''} onClick={onMicrophone} disabled={!self || !onMicrophone}  aria-label={microphone ? '关闭麦克风' : '打开麦克风'} aria-pressed={microphone}>{microphone ? <span>语音中</span> : <Mic aria-hidden="true" />}</button>
  </div>;
}

export function DeviceCard({ kind, name, online, screen, camera, microphone, self, onScreen, onCamera, onMicrophone, children }: {
  kind: 'tablet' | 'laptop'; name: string; online: boolean; screen: boolean; camera: boolean; microphone?: boolean; self: boolean;
  onScreen?: () => void; onCamera?: () => void; onMicrophone?: () => void; children: ReactNode;
}) {
  return <section className={`device-card device-${kind}${online ? ' is-online' : ' is-offline'}`} aria-label={`${name}的${kind === 'tablet' ? '平板电脑' : '笔记本电脑'}${online ? '' : '，未入会'}`}>
    <span className="device-shell" aria-hidden="true" />
    {online && <div className="device-screen">
      <DeviceIdentity name={name} />
      <DeviceMediaControls screen={screen} camera={camera} microphone={microphone} self={self} onScreen={onScreen} onCamera={onCamera} onMicrophone={onMicrophone} />
      <div className="device-activity">{children}</div>
    </div>}
  </section>;
}

export function ClassroomSeatingSettings({ profile, onChange, saving, error }: { profile: ClassroomProfile; onChange: (profile: ClassroomProfile) => void; saving?: boolean; error?: string }) {
  const changeSeat = (index: number, id: string) => {
    const seats = [...profile.seats]; const other = seats.indexOf(id);
    if (other >= 0 && other !== index) seats[other] = seats[index];
    seats[index] = id; onChange({ ...profile, seats });
  };
  return <div className="classroom-seating-settings">
    <p>两张桌子按成员固定；同一成员从多个设备入会仍共用一个位置，离线时屏幕熄灭。</p>
    {['第一桌 · 平板电脑', '第二桌 · 笔记本电脑'].map((label, index) => <label key={label}>{label}<select aria-label={label} disabled={saving || !profile.members.length} value={profile.seats[index] || ''} onChange={event => changeSeat(index, event.target.value)}>{!profile.seats[index] && <option value="">等待成员</option>}{profile.members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>)}
    <label>设备字体<select aria-label="设备字体" disabled={saving} value={profile.font} onChange={event => onChange({ ...profile, font: event.target.value })}><option value="sans">思源黑体风格 · Noto Sans SC</option><option value="rounded">站酷快乐体</option><option value="youyuan">幼圆 · 系统字体</option></select></label>
    <p className="device-font-note">英文和数字使用圆润的 Nunito。中文沿用当前设备的幼圆，未安装时使用 Noto Sans SC。</p>
    {error && <p role="status">{error}</p>}
  </div>;
}
