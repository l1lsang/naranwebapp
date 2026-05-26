import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Bell,
  CheckCheck,
  Image as ImageIcon,
  Info,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Smile,
  Video,
} from 'lucide-react'
import { signInAnonymously } from 'firebase/auth'
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from './lib/firebase'
import './App.css'

type ConnectionState = 'demo' | 'connecting' | 'live' | 'error'

type ChatRoom = {
  id: string
  name: string
  subtitle: string
  members: string
  unread: number
  accent: string
  status: string
}

type ChatMessage = {
  id: string
  roomId: string
  author: string
  authorId: string
  text: string
  time: string
  isMine: boolean
}

type StoredMessage = {
  roomId?: string
  authorId?: string
  authorName?: string
  text?: string
  createdAt?: Timestamp
}

const rooms: ChatRoom[] = [
  {
    id: 'crew',
    name: '프로젝트 크루',
    subtitle: 'Firebase 구조 확인했어요',
    members: '8명',
    unread: 3,
    accent: '#06c755',
    status: '작업 중',
  },
  {
    id: 'design',
    name: '디자인 라운지',
    subtitle: '버블 간격은 지금 느낌 좋아요',
    members: '4명',
    unread: 0,
    accent: '#4f7cff',
    status: '검토',
  },
  {
    id: 'support',
    name: '고객 응대',
    subtitle: '문의 자동 분류도 붙일 수 있어요',
    members: '12명',
    unread: 6,
    accent: '#ffb224',
    status: '대기',
  },
]

const demoMessages: Record<string, ChatMessage[]> = {
  crew: [
    {
      id: 'crew-1',
      roomId: 'crew',
      author: '민서',
      authorId: 'minseo',
      text: '오늘은 채팅 MVP 먼저 붙이고, 로그인은 익명 인증으로 열어둘게요.',
      time: '18:02',
      isMine: false,
    },
    {
      id: 'crew-2',
      roomId: 'crew',
      author: '나',
      authorId: 'local-me',
      text: '좋아요. LINE처럼 가볍고 빠르게 느껴지는 쪽으로 가죠.',
      time: '18:04',
      isMine: true,
    },
    {
      id: 'crew-3',
      roomId: 'crew',
      author: '지우',
      authorId: 'jiwoo',
      text: 'Vercel에는 Vite 빌드 결과만 올리고, 메시지는 Firestore에서 실시간 구독하면 됩니다.',
      time: '18:07',
      isMine: false,
    },
  ],
  design: [
    {
      id: 'design-1',
      roomId: 'design',
      author: '하린',
      authorId: 'harin',
      text: '초록색은 포인트로만 쓰고 배경은 차분하게 두면 오래 봐도 편해요.',
      time: '17:42',
      isMine: false,
    },
    {
      id: 'design-2',
      roomId: 'design',
      author: '나',
      authorId: 'local-me',
      text: '채팅방 목록과 대화 영역 밀도를 조금 높여볼게요.',
      time: '17:45',
      isMine: true,
    },
  ],
  support: [
    {
      id: 'support-1',
      roomId: 'support',
      author: '상담봇',
      authorId: 'bot',
      text: '새 문의 6건이 들어왔습니다. 긴급 키워드 1건이 포함되어 있어요.',
      time: '16:58',
      isMine: false,
    },
  ],
}

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
})

const makeLocalId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const formatTime = (date = new Date()) => timeFormatter.format(date)

const connectionCopy: Record<ConnectionState, string> = {
  demo: '로컬 데모',
  connecting: 'Firebase 연결 중',
  live: 'Firebase 실시간',
  error: 'Firebase 확인 필요',
}

function App() {
  const [activeRoomId, setActiveRoomId] = useState(rooms[0].id)
  const [draft, setDraft] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [messagesByRoom, setMessagesByRoom] = useState(demoMessages)
  const [remoteMessages, setRemoteMessages] = useState<ChatMessage[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    isFirebaseConfigured ? 'connecting' : 'demo',
  )
  const [currentUserId, setCurrentUserId] = useState('local-me')

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) ?? rooms[0],
    [activeRoomId],
  )

  const filteredRooms = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase()

    if (!normalizedTerm) {
      return rooms
    }

    return rooms.filter((room) =>
      `${room.name} ${room.subtitle} ${room.status}`
        .toLowerCase()
        .includes(normalizedTerm),
    )
  }, [searchTerm])

  const visibleMessages = useMemo(() => {
    if (isFirebaseConfigured && connectionState === 'live') {
      return remoteMessages
    }

    return messagesByRoom[activeRoomId] ?? []
  }, [activeRoomId, connectionState, messagesByRoom, remoteMessages])

  const unreadTotal = useMemo(
    () => rooms.reduce((total, room) => total + room.unread, 0),
    [],
  )

  const handleSelectRoom = (roomId: string) => {
    setActiveRoomId(roomId)

    if (isFirebaseConfigured) {
      setConnectionState('connecting')
      setRemoteMessages([])
    }
  }

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !db) {
      return
    }

    const firebaseAuth = auth
    const firestore = db
    let cancelled = false
    let unsubscribe: () => void = () => {}

    signInAnonymously(firebaseAuth)
      .then(({ user }) => {
        if (cancelled) {
          return
        }

        setCurrentUserId(user.uid)

        const messagesQuery = query(
          collection(firestore, 'rooms', activeRoomId, 'messages'),
          orderBy('createdAt', 'asc'),
          limit(80),
        )

        unsubscribe = onSnapshot(
          messagesQuery,
          (snapshot) => {
            const nextMessages = snapshot.docs
              .map((messageDoc) => {
                const data = messageDoc.data() as StoredMessage
                const createdAt = data.createdAt?.toDate()
                const authorId = data.authorId ?? 'unknown'
                const text = typeof data.text === 'string' ? data.text : ''

                return {
                  id: messageDoc.id,
                  roomId: data.roomId ?? activeRoomId,
                  author: authorId === user.uid ? '나' : (data.authorName ?? '친구'),
                  authorId,
                  text,
                  time: createdAt ? formatTime(createdAt) : '방금',
                  isMine: authorId === user.uid,
                }
              })
              .filter((message) => message.text.length > 0)

            setRemoteMessages(nextMessages)
            setConnectionState('live')
          },
          () => {
            setConnectionState('error')
            setRemoteMessages([])
          },
        )
      })
      .catch(() => {
        if (!cancelled) {
          setConnectionState('error')
          setRemoteMessages([])
        }
      })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [activeRoomId])

  const appendLocalMessage = (message: ChatMessage) => {
    setMessagesByRoom((currentMessages) => ({
      ...currentMessages,
      [activeRoomId]: [...(currentMessages[activeRoomId] ?? []), message],
    }))
  }

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const text = draft.trim()

    if (!text) {
      return
    }

    const localMessage: ChatMessage = {
      id: makeLocalId(),
      roomId: activeRoomId,
      author: '나',
      authorId: currentUserId,
      text,
      time: formatTime(),
      isMine: true,
    }

    setDraft('')

    if (isFirebaseConfigured && db && auth?.currentUser && connectionState !== 'error') {
      try {
        await addDoc(collection(db, 'rooms', activeRoomId, 'messages'), {
          roomId: activeRoomId,
          authorId: auth.currentUser.uid,
          authorName: '친구',
          text,
          createdAt: serverTimestamp(),
        })
        return
      } catch {
        setConnectionState('error')
      }
    }

    appendLocalMessage(localMessage)
  }

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="기본 메뉴">
        <button className="brand-mark" type="button" aria-label="홈" title="홈">
          <MessageCircle size={25} strokeWidth={2.4} />
        </button>
        <nav className="rail-nav">
          <button className="rail-button is-active" type="button" aria-label="채팅" title="채팅">
            <MessageCircle size={21} />
          </button>
          <button className="rail-button" type="button" aria-label="알림" title="알림">
            <Bell size={21} />
            <span className="dot" />
          </button>
          <button className="rail-button" type="button" aria-label="설정" title="설정">
            <Settings size={21} />
          </button>
        </nav>
      </aside>

      <section className="room-panel" aria-label="채팅방 목록">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">GreenTalk</p>
            <h1>채팅</h1>
          </div>
          <button className="icon-button" type="button" aria-label="채팅방 추가" title="채팅방 추가">
            <Plus size={20} />
          </button>
        </div>

        <label className="search-box">
          <Search size={18} />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="이름, 메시지 검색"
          />
        </label>

        <div className="connection-strip">
          <span className={`status-light is-${connectionState}`} />
          <span>{connectionCopy[connectionState]}</span>
          <strong>{unreadTotal}</strong>
        </div>

        <div className="room-list">
          {filteredRooms.map((room) => (
            <button
              className={`room-row ${room.id === activeRoomId ? 'is-active' : ''}`}
              key={room.id}
              type="button"
              onClick={() => handleSelectRoom(room.id)}
            >
              <span className="avatar" style={{ backgroundColor: room.accent }}>
                {room.name.slice(0, 1)}
              </span>
              <span className="room-copy">
                <span className="room-name">
                  {room.name}
                  <small>{room.members}</small>
                </span>
                <span className="room-subtitle">{room.subtitle}</span>
              </span>
              {room.unread > 0 && <span className="unread-count">{room.unread}</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="conversation-panel" aria-label={`${activeRoom.name} 대화`}>
        <div className="mobile-room-tabs" aria-label="모바일 채팅방 전환">
          {rooms.map((room) => (
            <button
              className={room.id === activeRoomId ? 'is-active' : ''}
              key={room.id}
              type="button"
              onClick={() => handleSelectRoom(room.id)}
            >
              {room.name}
            </button>
          ))}
        </div>

        <header className="chat-header">
          <div className="chat-title">
            <span className="avatar large" style={{ backgroundColor: activeRoom.accent }}>
              {activeRoom.name.slice(0, 1)}
            </span>
            <div>
              <h2>{activeRoom.name}</h2>
              <p>
                {activeRoom.members} · {activeRoom.status}
              </p>
            </div>
          </div>
          <div className="chat-actions">
            <button className="icon-button" type="button" aria-label="음성 통화" title="음성 통화">
              <Phone size={19} />
            </button>
            <button className="icon-button" type="button" aria-label="영상 통화" title="영상 통화">
              <Video size={19} />
            </button>
            <button className="icon-button" type="button" aria-label="대화 정보" title="대화 정보">
              <Info size={19} />
            </button>
          </div>
        </header>

        <div className="message-list" aria-live="polite">
          <div className="day-divider">오늘</div>
          {visibleMessages.length > 0 ? (
            visibleMessages.map((message) => (
              <article
                className={`message-row ${message.isMine ? 'is-mine' : ''}`}
                key={message.id}
              >
                {!message.isMine && (
                  <span className="avatar small">{message.author.slice(0, 1)}</span>
                )}
                <div className="message-stack">
                  {!message.isMine && <span className="message-author">{message.author}</span>}
                  <div className="bubble-line">
                    {message.isMine && <span className="message-time">{message.time}</span>}
                    <p className="message-bubble">{message.text}</p>
                    {!message.isMine && <span className="message-time">{message.time}</span>}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <MessageCircle size={34} />
              <p>아직 메시지가 없습니다. 첫 메시지를 보내보세요.</p>
            </div>
          )}
        </div>

        <form className="composer" onSubmit={handleSend}>
          <div className="composer-tools">
            <button type="button" aria-label="파일 첨부" title="파일 첨부">
              <Paperclip size={19} />
            </button>
            <button type="button" aria-label="이미지 첨부" title="이미지 첨부">
              <ImageIcon size={19} />
            </button>
            <button type="button" aria-label="이모티콘" title="이모티콘">
              <Smile size={19} />
            </button>
          </div>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`${activeRoom.name}에 메시지 보내기`}
            aria-label="메시지 입력"
          />
          <button className="mic-button" type="button" aria-label="음성 입력" title="음성 입력">
            <Mic size={19} />
          </button>
          <button className="send-button" type="submit" aria-label="전송" title="전송">
            <Send size={19} />
          </button>
        </form>
      </section>

      <aside className="detail-panel" aria-label="대화 상세 정보">
        <div className="detail-header">
          <button className="icon-button" type="button" aria-label="더보기" title="더보기">
            <MoreHorizontal size={20} />
          </button>
        </div>
        <div className="profile-card">
          <span className="profile-avatar" style={{ backgroundColor: activeRoom.accent }}>
            {activeRoom.name.slice(0, 1)}
          </span>
          <h2>{activeRoom.name}</h2>
          <p>{activeRoom.subtitle}</p>
          <div className="profile-actions">
            <button type="button" aria-label="통화" title="통화">
              <Phone size={18} />
            </button>
            <button type="button" aria-label="영상" title="영상">
              <Video size={18} />
            </button>
            <button type="button" aria-label="검색" title="검색">
              <Search size={18} />
            </button>
          </div>
        </div>
        <div className="detail-section">
          <h3>고정된 항목</h3>
          <button className="pinned-item" type="button">
            <CheckCheck size={18} />
            <span>Firestore 실시간 메시지 컬렉션</span>
          </button>
          <button className="pinned-item" type="button">
            <CheckCheck size={18} />
            <span>Vercel 환경변수 등록</span>
          </button>
        </div>
      </aside>
    </main>
  )
}

export default App
