import { useState, useEffect } from 'react'
import handState from '../utils/handState'

export default function Footer() {
  const [leftLocked,  setLeftLocked]  = useState(() => handState.leftLocked)
  const [rightLocked, setRightLocked] = useState(() => handState.rightLocked)

  useEffect(() => {
    // 잠금 상태는 초당 5회 체크로 충분 (RAF 60fps 대비 CPU 부하 대폭 감소)
    const timer = setInterval(() => {
      setLeftLocked(handState.leftLocked)
      setRightLocked(handState.rightLocked)
    }, 200)
    return () => clearInterval(timer)
  }, [])

  return (
    <footer>
      <div className="lock-status">
        <LockItem label="Left"  locked={leftLocked}  />
        <div className="lock-sep" />
        <LockItem label="Right" locked={rightLocked} />
      </div>
    </footer>
  )
}

function LockItem({ label, locked }) {
  return (
    <div className="lock-item">
      <span className="lock-hand">{label}</span>
      <span className={`lock-state${locked ? '' : ' lock-active'}`}>
        {locked ? 'Locked' : 'Unlocked'}
      </span>
    </div>
  )
}
