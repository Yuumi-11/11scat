"use client";
import { useRef, type ReactNode } from 'react';
import { MonitorUp, Video } from 'lucide-react';
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
      event.preventDefault(); event.currentTarget.form?.requestSubmit();
    }} />;
}

export function DeviceCard({ kind, name, online, screen, camera, self, onScreen, onCamera, children }: {
  kind: 'tablet' | 'laptop'; name: string; online: boolean; screen: boolean; camera: boolean; self: boolean;
  onScreen?: () => void; onCamera?: () => void; children: ReactNode;
}) {
  return <section className={`device-card device-${kind}${online ? ' is-online' : ' is-offline'}`} aria-label={`${name}的${kind === 'tablet' ? '平板电脑' : '笔记本电脑'}${online ? '' : '，未入会'}`}>
    <span className="device-shell" aria-hidden="true" />
    {online && <div className="device-screen">
      <header><strong className="device-name" title={name}>{name}</strong><div className="device-media-status">
        <button type="button" className={screen ? 'is-live' : ''} onClick={onScreen} disabled={!onScreen} title={screen ? self ? '关闭投屏或查看另一设备的投屏' : '查看投屏' : self ? '开启投屏' : '对方尚未投屏'} aria-label={screen ? '投屏中' : '开启投屏'}>{screen ? <><i aria-hidden="true" />投屏中</> : <MonitorUp aria-hidden="true" />}</button>
        <button type="button" className={camera ? 'is-live' : ''} onClick={onCamera} disabled={!onCamera} title={camera ? self ? '关闭视频或查看另一设备的视频' : '查看视频' : self ? '开启视频' : '对方尚未开启视频'} aria-label={camera ? '视频中' : '开启视频'}>{camera ? <><i aria-hidden="true" />视频中</> : <Video aria-hidden="true" />}</button>
      </div></header>
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
    <p className="device-font-note">幼圆使用当前设备已安装的字体，未安装时使用 Noto Sans SC。</p>
    {error && <p role="status">{error}</p>}
  </div>;
}
