"use client";
import { useRef, type ReactNode } from 'react';
import { Mic, MonitorUp, Video } from 'lucide-react';
import type { ClassroomAction, ClassroomProfile } from './classroom-members';
import { useDeviceFont } from './use-device-font';
import { deviceFontOptions } from './device-fonts';

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

export function DeviceCard({ kind, name, online, screen, camera, microphone, self, onScreen, onCamera, onMicrophone, children, font = 'resource-rounded' }: {
  kind: 'tablet' | 'laptop'; name: string; online: boolean; screen: boolean; camera: boolean; microphone?: boolean; self: boolean;
  onScreen?: () => void; onCamera?: () => void; onMicrophone?: () => void; children: ReactNode; font?: string;
}) {
  const deviceFont = useDeviceFont(font, online);
  return <section className={`device-card device-${kind}${online ? ' is-online' : ' is-offline'}`} aria-label={`${name}的${kind === 'tablet' ? '平板电脑' : '笔记本电脑'}${online ? '' : '，未入会'}`}>
    <span className="device-shell" aria-hidden="true" />
    {online && <div className="device-screen" data-font-status={deviceFont.status} aria-busy={deviceFont.status === 'loading'}>
      <DeviceIdentity name={name} />
      <DeviceMediaControls screen={screen} camera={camera} microphone={microphone} self={self} onScreen={onScreen} onCamera={onCamera} onMicrophone={onMicrophone} />
      <div className="device-activity">{children}</div>
      {deviceFont.status === 'loading' && <span className="device-font-loading" role="status" aria-label="字体加载中" />}
      {deviceFont.status === 'error' && <button type="button" className="device-font-retry" onClick={deviceFont.retry}>字体加载失败 · 重试</button>}
    </div>}
  </section>;
}

export function ClassroomGeneralSettings({ profile, identityId, onAction, saving, error }: { profile: ClassroomProfile; identityId: string; onAction: (action: ClassroomAction) => void; saving?: boolean; error?: string }) {
  const index = profile.seats.indexOf(identityId);
  const pending = profile.seatExchange;
  const incoming = pending?.recipientId === identityId;
  const outgoing = pending?.requesterId === identityId;
  const requester = profile.members.find(member => member.id === pending?.requesterId)?.name || '同桌';
  return <div className="classroom-general-settings">
    <section className="settings-seat-row" aria-label="座位">
      <div className="settings-option-heading"><strong>座位</strong><span>{index === 0 ? '第一桌 · 平板电脑' : index === 1 ? '第二桌 · 笔记本电脑' : '等待座位'}</span></div>
      {incoming && pending ? <div className="settings-seat-request"><span>{requester} 申请交换座位</span><div className="settings-seat-actions"><button type="button" disabled={saving} onClick={() => onAction({ action: 'approve-seat-exchange', requestId: pending.id })}>同意交换</button><button type="button" disabled={saving} onClick={() => onAction({ action: 'decline-seat-exchange', requestId: pending.id })}>拒绝</button></div></div>
        : outgoing && pending ? <div className="settings-seat-request"><span role="status">等待对方同意</span><button type="button" disabled={saving} onClick={() => onAction({ action: 'cancel-seat-exchange', requestId: pending.id })}>撤回申请</button></div>
        : <button type="button" disabled={saving || profile.seats.length !== 2 || index < 0 || !!pending} onClick={() => onAction({ action: 'request-seat-exchange' })}>申请交换</button>}
    </section>
    <label className="settings-font-row"><strong>设备字体</strong><select aria-label="设备字体" disabled={saving || index < 0} value={profile.font} onChange={event => onAction({ action: 'font', font: event.target.value })}>{deviceFontOptions.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label>
    {error && <p role="status">{error}</p>}
  </div>;
}
