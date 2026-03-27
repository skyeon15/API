import React, { useEffect } from 'react'

const ChannelWizardPage: React.FC = () => {
  useEffect(() => {
    window.location.href = '/skyeon15/channel-wizard'
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#F0F0F0' }}>
      채널 등록 페이지로 이동 중...
    </div>
  )
}

export default ChannelWizardPage
