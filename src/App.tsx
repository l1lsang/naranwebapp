import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Bell,
  CheckCheck,
  Image as ImageIcon,
  Info,
  LockKeyhole,
  LogOut,
  Mail,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  UserRound,
  Video,
} from 'lucide-react'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from './lib/firebase'
import './App.css'

type AuthMode = 'login' | 'signup' | 'reset'
type ConnectionState = 'demo' | 'connecting' | 'live' | 'error'
type UserRole = 'user' | 'admin'
type UserStatus = 'active' | 'blocked'
type AdminPanel = 'users' | 'direct' | 'group'
type RoomType = 'group' | 'direct'

type AuthSession = {
  uid: string
  email: string
  nickname: string
  role: UserRole
  status: UserStatus
  isDemo: boolean
}

type ManagedUser = {
  id: string
  email: string
  nickname: string
  role: UserRole
  status: UserStatus
}

type ChatRoom = {
  id: string
  name: string
  subtitle: string
  members: string
  unread: number
  accent: string
  status: string
  type: RoomType
  participantIds?: string[]
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

type StoredRoom = {
  name?: unknown
  subtitle?: unknown
  status?: unknown
  type?: unknown
  participantIds?: unknown
}

type StoredUserProfile = {
  email?: unknown
  nickname?: unknown
  role?: unknown
  status?: unknown
}

const initialRooms: ChatRoom[] = [
  {
    id: 'crew',
    name: '프로젝트 크루',
    subtitle: 'Firebase 구조 확인했어요',
    members: '8명',
    unread: 3,
    accent: '#06c755',
    status: '작업 중',
    type: 'group',
  },
  {
    id: 'design',
    name: '디자인 라운지',
    subtitle: '버블 간격은 지금 느낌 좋아요',
    members: '4명',
    unread: 0,
    accent: '#4f7cff',
    status: '검토',
    type: 'group',
  },
  {
    id: 'support',
    name: '고객 응대',
    subtitle: '문의 자동 분류도 붙일 수 있어요',
    members: '12명',
    unread: 6,
    accent: '#ffb224',
    status: '대기',
    type: 'group',
  },
]

const demoUsers: ManagedUser[] = [
  {
    id: 'demo-admin',
    email: 'admin@greentalk.local',
    nickname: '운영자',
    role: 'admin',
    status: 'active',
  },
  {
    id: 'minseo',
    email: 'minseo@example.com',
    nickname: '민서',
    role: 'user',
    status: 'active',
  },
  {
    id: 'jiwoo',
    email: 'jiwoo@example.com',
    nickname: '지우',
    role: 'user',
    status: 'active',
  },
  {
    id: 'harin',
    email: 'harin@example.com',
    nickname: '하린',
    role: 'user',
    status: 'blocked',
  },
]

const demoMessages: Record<string, ChatMessage[]> = {
  crew: [
    {
      id: 'crew-1',
      roomId: 'crew',
      author: '민서',
      authorId: 'minseo',
      text: '일반 유저는 기존 채팅방에서는 메시지를 보낼 수 있어요.',
      time: '18:02',
      isMine: false,
    },
    {
      id: 'crew-2',
      roomId: 'crew',
      author: '나',
      authorId: 'local-me',
      text: '새 채팅 시작은 관리자 버튼으로만 열리게 만들겠습니다.',
      time: '18:04',
      isMine: true,
    },
    {
      id: 'crew-3',
      roomId: 'crew',
      author: '지우',
      authorId: 'jiwoo',
      text: '관리자는 유저 관리, 1:1 대화 시작, 단톡 생성을 할 수 있으면 좋겠네요.',
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
      text: '권한별로 버튼이 다르게 보이도록 맞춰볼게요.',
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

const roomAccents = ['#06c755', '#4f7cff', '#ffb224', '#f25f5c', '#6f7bd9']

const roleCopy: Record<UserRole, string> = {
  user: '일반인',
  admin: '관리자',
}

const statusCopy: Record<UserStatus, string> = {
  active: '활성',
  blocked: '차단',
}

const makeLocalId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

const formatTime = (date = new Date()) => timeFormatter.format(date)

const getFallbackNickname = (email: string) => {
  const localPart = email.split('@')[0]?.trim()
  return localPart || '친구'
}

const normalizeRole = (role: unknown): UserRole => (role === 'admin' ? 'admin' : 'user')

const normalizeStatus = (status: unknown): UserStatus =>
  status === 'blocked' ? 'blocked' : 'active'

const getDemoRole = (email: string): UserRole =>
  email.toLowerCase().includes('admin') ? 'admin' : 'user'

const getDemoUserId = (email: string) =>
  getDemoRole(email) === 'admin' ? 'demo-admin' : 'local-me'

const getRoomAccent = (seed: number) => roomAccents[seed % roomAccents.length]

const connectionCopy: Record<ConnectionState, string> = {
  demo: '로컬 데모',
  connecting: 'Firebase 연결 중',
  live: 'Firebase 실시간',
  error: 'Firebase 확인 필요',
}

const authModeCopy: Record<AuthMode, string> = {
  login: '로그인',
  signup: '회원가입',
  reset: '비밀번호 찾기',
}

const getAuthErrorMessage = (error: unknown) => {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : ''

  if (code.includes('auth/email-already-in-use')) {
    return '이미 가입된 이메일입니다.'
  }

  if (code.includes('auth/invalid-credential') || code.includes('auth/user-not-found')) {
    return '이메일 또는 비밀번호를 확인해주세요.'
  }

  if (code.includes('auth/weak-password')) {
    return '비밀번호는 6자 이상으로 입력해주세요.'
  }

  if (code.includes('auth/invalid-email')) {
    return '이메일 형식을 확인해주세요.'
  }

  return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
}

const buildSessionFromUser = async (user: User): Promise<AuthSession> => {
  let nickname = user.displayName ?? ''
  let role: UserRole = 'user'
  let status: UserStatus = 'active'

  if (db) {
    const profileSnapshot = await getDoc(doc(db, 'users', user.uid))
    const profile = profileSnapshot.data() as StoredUserProfile | undefined

    nickname = typeof profile?.nickname === 'string' ? profile.nickname : nickname
    role = normalizeRole(profile?.role)
    status = normalizeStatus(profile?.status)
  }

  return {
    uid: user.uid,
    email: user.email ?? '',
    nickname,
    role,
    status,
    isDemo: false,
  }
}

function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [authReady, setAuthReady] = useState(!isFirebaseConfigured)
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authNickname, setAuthNickname] = useState('')
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [thirdPartyConsent, setThirdPartyConsent] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [chatRooms, setChatRooms] = useState(initialRooms)
  const [activeRoomId, setActiveRoomId] = useState(initialRooms[0].id)
  const [draft, setDraft] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [messagesByRoom, setMessagesByRoom] = useState(demoMessages)
  const [remoteMessages, setRemoteMessages] = useState<ChatMessage[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    isFirebaseConfigured ? 'connecting' : 'demo',
  )
  const [currentUserId, setCurrentUserId] = useState('local-me')
  const [managedUsers, setManagedUsers] = useState(demoUsers)
  const [adminPanel, setAdminPanel] = useState<AdminPanel>('users')
  const [adminNotice, setAdminNotice] = useState('')
  const [directTargetId, setDirectTargetId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([
    'minseo',
    'jiwoo',
  ])

  const isAdmin = authSession?.role === 'admin'
  const canSendMessage = authSession?.status === 'active'

  const activeRoom = useMemo(
    () => chatRooms.find((room) => room.id === activeRoomId) ?? chatRooms[0] ?? initialRooms[0],
    [activeRoomId, chatRooms],
  )

  const manageableUsers = useMemo(
    () => managedUsers.filter((user) => user.id !== authSession?.uid),
    [authSession?.uid, managedUsers],
  )

  const filteredRooms = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase()

    if (!normalizedTerm) {
      return chatRooms
    }

    return chatRooms.filter((room) =>
      `${room.name} ${room.subtitle} ${room.status}`
        .toLowerCase()
        .includes(normalizedTerm),
    )
  }, [chatRooms, searchTerm])

  const visibleMessages = useMemo(() => {
    if (isFirebaseConfigured && authSession && connectionState !== 'error') {
      return remoteMessages
    }

    return messagesByRoom[activeRoomId] ?? []
  }, [
    activeRoomId,
    authSession,
    connectionState,
    messagesByRoom,
    remoteMessages,
  ])

  const unreadTotal = useMemo(
    () => chatRooms.reduce((total, room) => total + room.unread, 0),
    [chatRooms],
  )

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      return
    }

    let cancelled = false

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthSession(null)
        setCurrentUserId('local-me')
        setAuthReady(true)
        return
      }

      try {
        const session = await buildSessionFromUser(user)

        if (cancelled) {
          return
        }

        setAuthSession(session)
        setCurrentUserId(session.uid)
        setAuthReady(true)
      } catch {
        if (!cancelled) {
          setAuthSession({
            uid: user.uid,
            email: user.email ?? '',
            nickname: user.displayName ?? '',
            role: 'user',
            status: 'active',
            isDemo: false,
          })
          setCurrentUserId(user.uid)
          setAuthReady(true)
        }
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!authSession || !isFirebaseConfigured || !db) {
      return
    }

    const roomsQuery =
      authSession.role === 'admin'
        ? query(collection(db, 'rooms'), limit(80))
        : query(
            collection(db, 'rooms'),
            where('participantIds', 'array-contains', authSession.uid),
            limit(80),
          )

    const unsubscribe = onSnapshot(
      roomsQuery,
      (snapshot) => {
        const remoteRooms: ChatRoom[] = snapshot.docs.map((roomDoc, index) => {
          const data = roomDoc.data() as StoredRoom
          const participantIds = Array.isArray(data.participantIds)
            ? data.participantIds.filter((id): id is string => typeof id === 'string')
            : []
          const type: RoomType = data.type === 'direct' ? 'direct' : 'group'

          return {
            id: roomDoc.id,
            name: typeof data.name === 'string' ? data.name : '새 채팅방',
            subtitle:
              typeof data.subtitle === 'string'
                ? data.subtitle
                : type === 'direct'
                  ? '관리자가 시작한 1:1 대화'
                  : '관리자가 만든 단톡방',
            members: `${Math.max(participantIds.length, 1)}명`,
            unread: 0,
            accent: getRoomAccent(index + 1),
            status: typeof data.status === 'string' ? data.status : '대화 가능',
            type,
            participantIds,
          }
        })

        const mergedRooms = [
          ...remoteRooms,
          ...initialRooms.filter(
            (initialRoom) => !remoteRooms.some((remoteRoom) => remoteRoom.id === initialRoom.id),
          ),
        ]

        setChatRooms(mergedRooms)
      },
      () => {
        setAdminNotice('채팅방 목록을 불러오지 못했습니다.')
      },
    )

    return unsubscribe
  }, [authSession])

  useEffect(() => {
    if (!authSession || authSession.role !== 'admin' || !isFirebaseConfigured || !db) {
      return
    }

    const usersQuery = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(100))

    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const nextUsers = snapshot.docs.map((userDoc) => {
          const data = userDoc.data() as StoredUserProfile
          const fallbackEmail = typeof data.email === 'string' ? data.email : ''
          const fallbackNickname =
            typeof data.nickname === 'string'
              ? data.nickname
              : getFallbackNickname(fallbackEmail)

          return {
            id: userDoc.id,
            email: fallbackEmail,
            nickname: fallbackNickname,
            role: normalizeRole(data.role),
            status: normalizeStatus(data.status),
          }
        })

        setManagedUsers(nextUsers)
      },
      () => {
        setAdminNotice('유저 목록을 불러오지 못했습니다.')
      },
    )

    return unsubscribe
  }, [authSession])

  useEffect(() => {
    if (!authSession || !isFirebaseConfigured || !db) {
      return
    }

    const messagesQuery = query(
      collection(db, 'rooms', activeRoomId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(80),
    )

    const unsubscribe = onSnapshot(
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
              author:
                authorId === authSession.uid ? '나' : (data.authorName ?? '친구'),
              authorId,
              text,
              time: createdAt ? formatTime(createdAt) : '방금',
              isMine: authorId === authSession.uid,
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

    return unsubscribe
  }, [activeRoomId, authSession])

  const completeDemoAuth = (email: string, nickname = getFallbackNickname(email)) => {
    const role = getDemoRole(email)

    setAuthSession({
      uid: getDemoUserId(email),
      email,
      nickname: role === 'admin' ? '운영자' : nickname,
      role,
      status: 'active',
      isDemo: true,
    })
    setCurrentUserId(getDemoUserId(email))
    setConnectionState('demo')
  }

  const switchAuthMode = (nextMode: AuthMode) => {
    setAuthMode(nextMode)
    setAuthError('')
    setAuthMessage('')
  }

  const saveUserProfile = async (
    uid: string,
    email: string,
    nickname: string,
    consentGranted?: boolean,
  ) => {
    if (!db) {
      return
    }

    const profilePayload =
      typeof consentGranted === 'boolean'
        ? {
            uid,
            email,
            nickname,
            role: 'user',
            status: 'active',
            thirdPartyConsent: consentGranted,
            thirdPartyConsentAt: serverTimestamp(),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        : {
            uid,
            email,
            nickname,
            updatedAt: serverTimestamp(),
          }

    await setDoc(doc(db, 'users', uid), profilePayload, { merge: true })
  }

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const email = authEmail.trim()
    const password = authPassword.trim()
    const nickname = authNickname.trim()

    setAuthError('')
    setAuthMessage('')

    if (!email) {
      setAuthError('이메일을 입력해주세요.')
      return
    }

    if (authMode !== 'reset' && password.length < 6) {
      setAuthError('비밀번호는 6자 이상으로 입력해주세요.')
      return
    }

    if (authMode === 'signup' && nickname.length < 2) {
      setAuthError('닉네임은 2자 이상으로 입력해주세요.')
      return
    }

    if (authMode === 'signup' && !thirdPartyConsent) {
      setAuthError('개인정보 제3자 제공 동의가 필요합니다.')
      return
    }

    setIsAuthSubmitting(true)

    try {
      if (authMode === 'reset') {
        if (isFirebaseConfigured && auth) {
          await sendPasswordResetEmail(auth, email)
        }

        setAuthMessage(
          isFirebaseConfigured
            ? '비밀번호 재설정 메일을 보냈습니다.'
            : '데모 모드에서는 재설정 메일 발송 없이 흐름만 확인합니다.',
        )
        return
      }

      if (!isFirebaseConfigured || !auth) {
        completeDemoAuth(email, authMode === 'signup' ? nickname : undefined)
        return
      }

      if (authMode === 'signup') {
        const { user } = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(user, { displayName: nickname })
        await saveUserProfile(user.uid, email, nickname, true)

        setAuthSession({
          uid: user.uid,
          email,
          nickname,
          role: 'user',
          status: 'active',
          isDemo: false,
        })
        setCurrentUserId(user.uid)
        setConnectionState('connecting')
        return
      }

      const { user } = await signInWithEmailAndPassword(auth, email, password)
      const session = await buildSessionFromUser(user)

      setAuthSession(session)
      setCurrentUserId(session.uid)
      setConnectionState('connecting')
    } catch (error) {
      setAuthError(getAuthErrorMessage(error))
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const handleNicknameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nickname = nicknameDraft.trim()

    setAuthError('')
    setAuthMessage('')

    if (!authSession) {
      return
    }

    if (nickname.length < 2) {
      setAuthError('닉네임은 2자 이상으로 입력해주세요.')
      return
    }

    setIsAuthSubmitting(true)

    try {
      if (authSession.isDemo || !isFirebaseConfigured || !auth?.currentUser) {
        setAuthSession({ ...authSession, nickname })
        return
      }

      await updateProfile(auth.currentUser, { displayName: nickname })
      await saveUserProfile(authSession.uid, authSession.email, nickname)
      setAuthSession({ ...authSession, nickname })
      setConnectionState('connecting')
    } catch (error) {
      setAuthError(getAuthErrorMessage(error))
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setRemoteMessages([])
    setAuthError('')
    setAuthMessage('')
    setDraft('')
    setAdminNotice('')

    if (isFirebaseConfigured && auth) {
      await signOut(auth)
      setConnectionState('connecting')
      return
    }

    setAuthSession(null)
    setCurrentUserId('local-me')
    setConnectionState('demo')
  }

  const openAdminPanel = (panel: AdminPanel) => {
    if (!isAdmin) {
      setAdminNotice('일반인은 새 채팅을 먼저 시작할 수 없습니다.')
      return
    }

    setAdminPanel(panel)
    setAdminNotice('')
  }

  const handleSelectRoom = (roomId: string) => {
    setActiveRoomId(roomId)

    if (isFirebaseConfigured) {
      setConnectionState('connecting')
      setRemoteMessages([])
    }
  }

  const appendLocalMessage = (message: ChatMessage) => {
    setMessagesByRoom((currentMessages) => ({
      ...currentMessages,
      [activeRoomId]: [...(currentMessages[activeRoomId] ?? []), message],
    }))
  }

  const handleCreateDirectChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!authSession || !isAdmin) {
      setAdminNotice('관리자만 대화를 시작할 수 있습니다.')
      return
    }

    const targetId = directTargetId || manageableUsers[0]?.id
    const targetUser = manageableUsers.find((user) => user.id === targetId)

    if (!targetUser) {
      setAdminNotice('대화를 시작할 유저가 없습니다.')
      return
    }

    const existingRoom = chatRooms.find(
      (room) =>
        room.type === 'direct' &&
        room.participantIds?.includes(authSession.uid) &&
        room.participantIds.includes(targetUser.id),
    )

    if (existingRoom) {
      setActiveRoomId(existingRoom.id)
      setAdminNotice(`${targetUser.nickname}님과의 기존 대화방을 열었습니다.`)
      return
    }

    let roomId = makeLocalId()
    const participantIds = [authSession.uid, targetUser.id]
    const nextRoom: ChatRoom = {
      id: roomId,
      name: targetUser.nickname,
      subtitle: `${authSession.nickname}님이 시작한 1:1 대화`,
      members: '2명',
      unread: 0,
      accent: '#06c755',
      status: '1:1',
      type: 'direct',
      participantIds,
    }

    try {
      if (isFirebaseConfigured && db) {
        const roomDoc = await addDoc(collection(db, 'rooms'), {
          name: nextRoom.name,
          subtitle: nextRoom.subtitle,
          status: nextRoom.status,
          type: 'direct',
          participantIds,
          createdBy: authSession.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        roomId = roomDoc.id
      }

      const createdRoom = { ...nextRoom, id: roomId }
      setChatRooms((currentRooms) => [createdRoom, ...currentRooms])
      setMessagesByRoom((currentMessages) => ({
        ...currentMessages,
        [roomId]: currentMessages[roomId] ?? [],
      }))
      setActiveRoomId(roomId)
      setAdminNotice(`${targetUser.nickname}님과의 대화를 시작했습니다.`)
    } catch {
      setAdminNotice('대화방을 만들지 못했습니다. 권한과 규칙을 확인해주세요.')
    }
  }

  const toggleGroupMember = (userId: string) => {
    setSelectedGroupMemberIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((id) => id !== userId)
        : [...currentIds, userId],
    )
  }

  const handleCreateGroupChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!authSession || !isAdmin) {
      setAdminNotice('관리자만 단톡을 만들 수 있습니다.')
      return
    }

    const roomName = groupName.trim()

    if (roomName.length < 2) {
      setAdminNotice('단톡 이름은 2자 이상으로 입력해주세요.')
      return
    }

    if (selectedGroupMemberIds.length < 2) {
      setAdminNotice('단톡에는 유저를 2명 이상 선택해주세요.')
      return
    }

    let roomId = makeLocalId()
    const participantIds = [authSession.uid, ...selectedGroupMemberIds]
    const nextRoom: ChatRoom = {
      id: roomId,
      name: roomName,
      subtitle: `${authSession.nickname}님이 만든 단톡방`,
      members: `${participantIds.length}명`,
      unread: 0,
      accent: getRoomAccent(chatRooms.length + 1),
      status: '단톡',
      type: 'group',
      participantIds,
    }

    try {
      if (isFirebaseConfigured && db) {
        const roomDoc = await addDoc(collection(db, 'rooms'), {
          name: nextRoom.name,
          subtitle: nextRoom.subtitle,
          status: nextRoom.status,
          type: 'group',
          participantIds,
          createdBy: authSession.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        roomId = roomDoc.id
      }

      const createdRoom = { ...nextRoom, id: roomId }
      setChatRooms((currentRooms) => [createdRoom, ...currentRooms])
      setMessagesByRoom((currentMessages) => ({
        ...currentMessages,
        [roomId]: currentMessages[roomId] ?? [],
      }))
      setGroupName('')
      setActiveRoomId(roomId)
      setAdminNotice(`${roomName} 단톡방을 만들었습니다.`)
    } catch {
      setAdminNotice('단톡방을 만들지 못했습니다. 권한과 규칙을 확인해주세요.')
    }
  }

  const handleToggleUserStatus = async (user: ManagedUser) => {
    if (!isAdmin) {
      return
    }

    const nextStatus: UserStatus = user.status === 'active' ? 'blocked' : 'active'

    try {
      if (isFirebaseConfigured && db) {
        await setDoc(
          doc(db, 'users', user.id),
          {
            status: nextStatus,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      }

      setManagedUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === user.id
            ? { ...currentUser, status: nextStatus }
            : currentUser,
        ),
      )
      setAdminNotice(`${user.nickname}님을 ${statusCopy[nextStatus]} 상태로 변경했습니다.`)
    } catch {
      setAdminNotice('유저 상태를 변경하지 못했습니다.')
    }
  }

  const handleToggleUserRole = async (user: ManagedUser) => {
    if (!isAdmin || user.id === authSession?.uid) {
      setAdminNotice('본인 권한은 여기서 변경할 수 없습니다.')
      return
    }

    const nextRole: UserRole = user.role === 'admin' ? 'user' : 'admin'

    try {
      if (isFirebaseConfigured && db) {
        await setDoc(
          doc(db, 'users', user.id),
          {
            role: nextRole,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        )
      }

      setManagedUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === user.id ? { ...currentUser, role: nextRole } : currentUser,
        ),
      )
      setAdminNotice(`${user.nickname}님 권한을 ${roleCopy[nextRole]}으로 변경했습니다.`)
    } catch {
      setAdminNotice('유저 권한을 변경하지 못했습니다.')
    }
  }

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const text = draft.trim()

    if (!text || !authSession || !canSendMessage) {
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
          authorName: authSession.nickname,
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

  if (!authReady) {
    return (
      <main className="auth-shell">
        <section className="auth-card auth-loading" aria-live="polite">
          <span className="brand-mark auth-brand">
            <MessageCircle size={28} strokeWidth={2.4} />
          </span>
          <h1>GreenTalk</h1>
          <p>로그인 상태를 확인하고 있습니다.</p>
        </section>
      </main>
    )
  }

  if (!authSession) {
    return (
      <main className="auth-shell">
        <section className="auth-visual" aria-label="GreenTalk 미리보기">
          <div className="auth-logo">
            <MessageCircle size={32} strokeWidth={2.4} />
          </div>
          <div className="preview-phone">
            <div className="preview-topbar">
              <span />
              <strong>GreenTalk</strong>
              <span />
            </div>
            <div className="preview-bubbles">
              <p>일반 유저는 기존 방에서만 대화할 수 있어요.</p>
              <p>관리자는 유저와 먼저 대화를 시작할 수 있습니다.</p>
              <p>단톡방 생성도 관리자 권한으로 처리됩니다.</p>
            </div>
          </div>
        </section>

        <section className="auth-card" aria-label={authModeCopy[authMode]}>
          <p className="eyebrow">GreenTalk</p>
          <h1>{authModeCopy[authMode]}</h1>
          <div className="auth-tabs" role="tablist" aria-label="인증 메뉴">
            {(['login', 'signup', 'reset'] as AuthMode[]).map((mode) => (
              <button
                className={authMode === mode ? 'is-active' : ''}
                key={mode}
                type="button"
                onClick={() => switchAuthMode(mode)}
              >
                {authModeCopy[mode]}
              </button>
            ))}
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {authMode === 'signup' && (
              <label className="field">
                <span>닉네임</span>
                <div className="field-control">
                  <UserRound size={18} />
                  <input
                    value={authNickname}
                    onChange={(event) => setAuthNickname(event.target.value)}
                    placeholder="채팅에서 표시될 이름"
                    autoComplete="nickname"
                  />
                </div>
              </label>
            )}

            <label className="field">
              <span>이메일</span>
              <div className="field-control">
                <Mail size={18} />
                <input
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </div>
            </label>

            {authMode !== 'reset' && (
              <label className="field">
                <span>비밀번호</span>
                <div className="field-control">
                  <LockKeyhole size={18} />
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="6자 이상"
                    autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                  />
                </div>
              </label>
            )}

            {authMode === 'signup' && (
              <label className="consent-row">
                <input
                  type="checkbox"
                  checked={thirdPartyConsent}
                  onChange={(event) => setThirdPartyConsent(event.target.checked)}
                />
                <span>
                  <strong>개인정보 제3자 제공에 동의합니다.</strong>
                  Firebase Authentication, Cloud Firestore, Vercel에 이메일,
                  닉네임, 서비스 이용 기록이 제공될 수 있습니다.
                </span>
              </label>
            )}

            {authError && (
              <p className="form-message is-error" role="alert">
                {authError}
              </p>
            )}
            {authMessage && <p className="form-message is-success">{authMessage}</p>}

            <button className="primary-button" type="submit" disabled={isAuthSubmitting}>
              {isAuthSubmitting ? '처리 중' : authModeCopy[authMode]}
            </button>

            {!isFirebaseConfigured && (
              <div className="demo-note">
                <ShieldCheck size={17} />
                <span>데모에서 관리자 확인은 이메일에 admin을 넣어 로그인하세요.</span>
              </div>
            )}
          </form>
        </section>
      </main>
    )
  }

  if (!authSession.nickname) {
    return (
      <main className="auth-shell">
        <section className="auth-card nickname-card" aria-label="닉네임 설정">
          <span className="brand-mark auth-brand">
            <UserRound size={27} />
          </span>
          <p className="eyebrow">GreenTalk</p>
          <h1>닉네임 설정</h1>
          <form className="auth-form" onSubmit={handleNicknameSubmit}>
            <label className="field">
              <span>닉네임</span>
              <div className="field-control">
                <UserRound size={18} />
                <input
                  value={nicknameDraft}
                  onChange={(event) => setNicknameDraft(event.target.value)}
                  placeholder="2자 이상 입력"
                  autoComplete="nickname"
                />
              </div>
            </label>
            {authError && (
              <p className="form-message is-error" role="alert">
                {authError}
              </p>
            )}
            <button className="primary-button" type="submit" disabled={isAuthSubmitting}>
              {isAuthSubmitting ? '저장 중' : '저장'}
            </button>
          </form>
        </section>
      </main>
    )
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
          {isAdmin && (
            <button
              className="rail-button"
              type="button"
              onClick={() => openAdminPanel('users')}
              aria-label="관리"
              title="관리"
            >
              <ShieldCheck size={21} />
            </button>
          )}
          <button className="rail-button" type="button" aria-label="설정" title="설정">
            <Settings size={21} />
          </button>
        </nav>
        <div className="rail-spacer" />
        <button
          className="rail-button"
          type="button"
          onClick={handleLogout}
          aria-label="로그아웃"
          title="로그아웃"
        >
          <LogOut size={21} />
        </button>
      </aside>

      <section className="room-panel" aria-label="채팅방 목록">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">GreenTalk</p>
            <h1>채팅</h1>
            <p className="signed-user">
              {authSession.nickname}
              <span className={`role-pill is-${authSession.role}`}>
                {roleCopy[authSession.role]}
              </span>
            </p>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => openAdminPanel('direct')}
            aria-label={isAdmin ? '대화 시작' : '대화 시작 제한'}
            title={isAdmin ? '대화 시작' : '관리자만 대화를 시작할 수 있음'}
          >
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

        {isAdmin ? (
          <div className="admin-quick-actions">
            <button type="button" onClick={() => openAdminPanel('users')}>
              <UserRound size={16} />
              유저
            </button>
            <button type="button" onClick={() => openAdminPanel('direct')}>
              <MessageCircle size={16} />
              1:1
            </button>
            <button type="button" onClick={() => openAdminPanel('group')}>
              <Plus size={16} />
              단톡
            </button>
          </div>
        ) : (
          <p className="permission-note">기존 채팅방에서만 메시지를 보낼 수 있습니다.</p>
        )}

        {adminNotice && <p className="admin-notice">{adminNotice}</p>}

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
          {chatRooms.map((room) => (
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
            disabled={!canSendMessage}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              canSendMessage
                ? `${activeRoom.name}에 메시지 보내기`
                : '차단된 계정은 메시지를 보낼 수 없습니다.'
            }
            aria-label="메시지 입력"
          />
          <button className="mic-button" type="button" aria-label="음성 입력" title="음성 입력">
            <Mic size={19} />
          </button>
          <button
            className="send-button"
            type="submit"
            disabled={!canSendMessage}
            aria-label="전송"
            title="전송"
          >
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

        {isAdmin ? (
          <div className="admin-console">
            <div className="admin-tabs" role="tablist" aria-label="관리 메뉴">
              <button
                className={adminPanel === 'users' ? 'is-active' : ''}
                type="button"
                onClick={() => openAdminPanel('users')}
              >
                유저
              </button>
              <button
                className={adminPanel === 'direct' ? 'is-active' : ''}
                type="button"
                onClick={() => openAdminPanel('direct')}
              >
                1:1
              </button>
              <button
                className={adminPanel === 'group' ? 'is-active' : ''}
                type="button"
                onClick={() => openAdminPanel('group')}
              >
                단톡
              </button>
            </div>

            {adminPanel === 'users' && (
              <div className="managed-user-list">
                {managedUsers.map((user) => (
                  <article className="managed-user-row" key={user.id}>
                    <span className="avatar small">{user.nickname.slice(0, 1)}</span>
                    <div>
                      <strong>{user.nickname}</strong>
                      <span>{user.email || '이메일 없음'}</span>
                      <small>
                        {roleCopy[user.role]} · {statusCopy[user.status]}
                      </small>
                    </div>
                    <div className="user-actions">
                      <button
                        type="button"
                        onClick={() => handleToggleUserRole(user)}
                        disabled={user.id === authSession.uid}
                      >
                        권한
                      </button>
                      <button type="button" onClick={() => handleToggleUserStatus(user)}>
                        {user.status === 'active' ? '차단' : '해제'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {adminPanel === 'direct' && (
              <form className="admin-form" onSubmit={handleCreateDirectChat}>
                <label className="field">
                  <span>대화할 유저</span>
                  <select
                    value={directTargetId || manageableUsers[0]?.id || ''}
                    onChange={(event) => setDirectTargetId(event.target.value)}
                    disabled={manageableUsers.length === 0}
                  >
                    {manageableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.nickname} · {roleCopy[user.role]}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" type="submit">
                  1:1 대화 시작
                </button>
              </form>
            )}

            {adminPanel === 'group' && (
              <form className="admin-form" onSubmit={handleCreateGroupChat}>
                <label className="field">
                  <span>단톡 이름</span>
                  <div className="field-control">
                    <MessageCircle size={18} />
                    <input
                      value={groupName}
                      onChange={(event) => setGroupName(event.target.value)}
                      placeholder="예: 신규 상담팀"
                    />
                  </div>
                </label>
                <div className="group-member-list">
                  {manageableUsers.map((user) => (
                    <label className="member-check" key={user.id}>
                      <input
                        type="checkbox"
                        checked={selectedGroupMemberIds.includes(user.id)}
                        onChange={() => toggleGroupMember(user.id)}
                      />
                      <span>{user.nickname}</span>
                      <small>{statusCopy[user.status]}</small>
                    </label>
                  ))}
                </div>
                <button className="primary-button" type="submit">
                  단톡 만들기
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="detail-section">
            <h3>권한</h3>
            <button className="pinned-item" type="button">
              <CheckCheck size={18} />
              <span>기존 채팅방 메시지 전송</span>
            </button>
            <button className="pinned-item is-locked" type="button">
              <LockKeyhole size={18} />
              <span>새 대화 시작은 관리자 전용</span>
            </button>
          </div>
        )}
      </aside>
    </main>
  )
}

export default App
