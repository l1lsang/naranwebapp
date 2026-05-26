import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import {
  ArrowLeft,
  Bell,
  Camera,
  CheckCheck,
  Download,
  FileText,
  Image as ImageIcon,
  Info,
  KeyRound,
  LockKeyhole,
  LogOut,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Newspaper,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Smile,
  Trash2,
  UploadCloud,
  UserRound,
  Video,
  X,
} from 'lucide-react'
import {
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
  type User,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore'
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from 'firebase/storage'
import { auth, db, isFirebaseConfigured, storage as fileStorage } from './lib/firebase'
import './App.css'

type AuthMode = 'login' | 'signup' | 'reset'
type ConnectionState = 'connecting' | 'live' | 'error'
type UserRole = 'user' | 'admin'
type UserStatus = 'active' | 'blocked'
type AdminPanel = 'users' | 'direct' | 'group' | 'retention'
type RoomType = 'group' | 'direct'
type AttachmentKind = 'image' | 'file'
type MobileTab = 'friends' | 'chats' | 'news' | 'calls'
type RetentionPolicy = 'oneDay' | 'oneMonth'

type AuthSession = {
  uid: string
  email: string
  nickname: string
  role: UserRole
  status: UserStatus
  photoURL: string
  photoPath: string
}

type ManagedUser = {
  id: string
  email: string
  nickname: string
  role: UserRole
  status: UserStatus
  photoURL?: string
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
  retentionPolicy: RetentionPolicy
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
  attachment?: MessageAttachment
}

type MessageAttachment = {
  kind: AttachmentKind
  name: string
  url: string
  path: string
  contentType: string
  size: number
}

type ReadReceipt = {
  userId: string
  lastReadMessageId: string
}

type StoredMessage = {
  roomId?: string
  authorId?: string
  authorName?: string
  text?: string
  attachment?: unknown
  createdAt?: Timestamp
}

type StoredReadReceipt = {
  userId?: unknown
  lastReadMessageId?: unknown
}

type StoredRoom = {
  name?: unknown
  subtitle?: unknown
  status?: unknown
  type?: unknown
  retentionPolicy?: unknown
  participantIds?: unknown
}

type StoredUserProfile = {
  email?: unknown
  nickname?: unknown
  role?: unknown
  status?: unknown
  photoURL?: unknown
  photoPath?: unknown
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

const defaultRetentionPolicy: RetentionPolicy = 'oneDay'

const retentionCopy: Record<RetentionPolicy, string> = {
  oneDay: '1일 후 삭제',
  oneMonth: '1달 지난 데이터 삭제',
}

const retentionDescription: Record<RetentionPolicy, string> = {
  oneDay: '새 메시지와 파일은 1일 뒤 자동 삭제됩니다.',
  oneMonth: '새 메시지와 파일은 30일 뒤 자동 삭제됩니다.',
}

const retentionDays: Record<RetentionPolicy, number> = {
  oneDay: 1,
  oneMonth: 30,
}

const maxAttachmentBytes = 20 * 1024 * 1024
const maxProfileImageBytes = 5 * 1024 * 1024

const formatTime = (date = new Date()) => timeFormatter.format(date)

const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  if (bytes >= 1024) {
    return `${Math.ceil(bytes / 1024)}KB`
  }

  return `${bytes}B`
}

const sanitizeStorageName = (fileName: string) =>
  fileName
    .trim()
    .replace(/[\\/:*?"<>|#%{}[\]~]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 120) || 'attachment'

const createUploadPath = (roomId: string, userId: string, fileName: string) => {
  const safeName = sanitizeStorageName(fileName)
  const uniqueId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return `chatFiles/${roomId}/${userId}/${uniqueId}-${safeName}`
}

const createProfileImagePath = (userId: string, fileName: string) => {
  const safeName = sanitizeStorageName(fileName)
  const uniqueId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  return `profileImages/${userId}/${uniqueId}-${safeName}`
}

const getFallbackNickname = (email: string) => {
  const localPart = email.split('@')[0]?.trim()
  return localPart || '친구'
}

const normalizeRole = (role: unknown): UserRole => (role === 'admin' ? 'admin' : 'user')

const normalizeStatus = (status: unknown): UserStatus =>
  status === 'blocked' ? 'blocked' : 'active'

const normalizeRetentionPolicy = (policy: unknown): RetentionPolicy =>
  policy === 'oneMonth' ? 'oneMonth' : defaultRetentionPolicy

const getRoomAccent = (seed: number) => roomAccents[seed % roomAccents.length]

const getRetentionExpiresAt = (policy: RetentionPolicy) =>
  Timestamp.fromMillis(Date.now() + retentionDays[policy] * 24 * 60 * 60 * 1000)

const normalizeAttachment = (attachment: unknown): MessageAttachment | undefined => {
  if (!attachment || typeof attachment !== 'object') {
    return undefined
  }

  const data = attachment as Record<string, unknown>
  const kind: AttachmentKind = data.kind === 'image' ? 'image' : 'file'
  const name = typeof data.name === 'string' ? data.name : ''
  const url = typeof data.url === 'string' ? data.url : ''
  const path = typeof data.path === 'string' ? data.path : ''
  const contentType = typeof data.contentType === 'string' ? data.contentType : ''
  const size = typeof data.size === 'number' ? data.size : 0

  if (!name || !url || !path) {
    return undefined
  }

  return {
    kind,
    name,
    url,
    path,
    contentType,
    size,
  }
}

const connectionCopy: Record<ConnectionState, string> = {
  connecting: '연결 중',
  live: '실시간 연결됨',
  error: '연결 확인 필요',
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

  if (code.includes('auth/wrong-password')) {
    return '현재 비밀번호를 확인해주세요.'
  }

  if (code.includes('auth/requires-recent-login')) {
    return '보안을 위해 다시 로그인한 뒤 시도해주세요.'
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
  let photoURL = user.photoURL ?? ''
  let photoPath = ''

  if (db) {
    const profileSnapshot = await getDoc(doc(db, 'users', user.uid))
    const profile = profileSnapshot.data() as StoredUserProfile | undefined

    nickname = typeof profile?.nickname === 'string' ? profile.nickname : nickname
    role = normalizeRole(profile?.role)
    status = normalizeStatus(profile?.status)
    photoURL = typeof profile?.photoURL === 'string' ? profile.photoURL : photoURL
    photoPath = typeof profile?.photoPath === 'string' ? profile.photoPath : photoPath
  }

  return {
    uid: user.uid,
    email: user.email ?? '',
    nickname,
    role,
    status,
    photoURL,
    photoPath,
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
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([])
  const [activeRoomId, setActiveRoomId] = useState('')
  const [mobileTab, setMobileTab] = useState<MobileTab>('chats')
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [remoteMessages, setRemoteMessages] = useState<ChatMessage[]>([])
  const [readReceipts, setReadReceipts] = useState<ReadReceipt[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadNotice, setUploadNotice] = useState('')
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsNickname, setSettingsNickname] = useState('')
  const [settingsCurrentPassword, setSettingsCurrentPassword] = useState('')
  const [settingsNewPassword, setSettingsNewPassword] = useState('')
  const [settingsConfirmPassword, setSettingsConfirmPassword] = useState('')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [settingsError, setSettingsError] = useState('')
  const [settingsNotice, setSettingsNotice] = useState('')
  const [isSettingsSubmitting, setIsSettingsSubmitting] = useState(false)
  const [isProfileImageUploading, setIsProfileImageUploading] = useState(false)
  const [profileImageProgress, setProfileImageProgress] = useState(0)
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([])
  const [adminPanel, setAdminPanel] = useState<AdminPanel>('users')
  const [adminNotice, setAdminNotice] = useState('')
  const [directTargetId, setDirectTargetId] = useState('')
  const [groupName, setGroupName] = useState('')
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([])
  const [retentionRoomId, setRetentionRoomId] = useState('')
  const lastMarkedReadRef = useRef('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const profileImageInputRef = useRef<HTMLInputElement | null>(null)
  const dragDepthRef = useRef(0)

  const isAdmin = authSession?.role === 'admin'
  const canSendMessage =
    authSession?.status === 'active' &&
    Boolean(activeRoomId) &&
    connectionState !== 'error' &&
    !isUploading

  const activeRoom = useMemo(
    () => chatRooms.find((room) => room.id === activeRoomId),
    [activeRoomId, chatRooms],
  )

  const mobileDirectRooms = useMemo(
    () => chatRooms.filter((room) => room.type === 'direct'),
    [chatRooms],
  )

  const retentionTargetRoom = useMemo(
    () => chatRooms.find((room) => room.id === retentionRoomId) ?? chatRooms[0],
    [chatRooms, retentionRoomId],
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

  const visibleMessages = useMemo(
    () => (activeRoom && authSession ? remoteMessages : []),
    [activeRoom, authSession, remoteMessages],
  )

  const readBadgeByMessageId = useMemo(() => {
    const nextBadges: Record<string, number> = {}

    if (!authSession || visibleMessages.length === 0) {
      return nextBadges
    }

    readReceipts
      .filter((receipt) => receipt.userId !== authSession.uid)
      .forEach((receipt) => {
        const readIndex = visibleMessages.findIndex(
          (message) => message.id === receipt.lastReadMessageId,
        )

        if (readIndex < 0) {
          return
        }

        for (let index = readIndex; index >= 0; index -= 1) {
          const message = visibleMessages[index]

          if (message.authorId === authSession.uid) {
            nextBadges[message.id] = (nextBadges[message.id] ?? 0) + 1
            return
          }
        }
      })

    return nextBadges
  }, [authSession, readReceipts, visibleMessages])

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
        setChatRooms([])
        setRemoteMessages([])
        setReadReceipts([])
        setManagedUsers([])
        setActiveRoomId('')
        setMobileTab('chats')
        setIsMobileChatOpen(false)
        setRetentionRoomId('')
        setAuthReady(true)
        return
      }

      try {
        const session = await buildSessionFromUser(user)

        if (cancelled) {
          return
        }

        setAuthSession(session)
        setAuthReady(true)
      } catch {
        if (!cancelled) {
          setAuthSession({
            uid: user.uid,
            email: user.email ?? '',
            nickname: user.displayName ?? '',
            role: 'user',
            status: 'active',
            photoURL: user.photoURL ?? '',
            photoPath: '',
          })
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
            retentionPolicy: normalizeRetentionPolicy(data.retentionPolicy),
            participantIds,
          }
        })

        setChatRooms(remoteRooms)

        if (remoteRooms.length === 0) {
          setRemoteMessages([])
          setReadReceipts([])
        }

        setActiveRoomId((currentRoomId) => {
          if (remoteRooms.length === 0) {
            return ''
          }

          return remoteRooms.some((room) => room.id === currentRoomId) ? currentRoomId : ''
        })
        setConnectionState('live')
      },
      () => {
        setConnectionState('error')
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
            photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
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
    if (!authSession || !isFirebaseConfigured || !db || !activeRoomId) {
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
            const attachment = normalizeAttachment(data.attachment)

            return {
              id: messageDoc.id,
              roomId: data.roomId ?? activeRoomId,
              author:
                authorId === authSession.uid ? '나' : (data.authorName ?? '친구'),
              authorId,
              text,
              time: createdAt ? formatTime(createdAt) : '방금',
              isMine: authorId === authSession.uid,
              attachment,
            }
          })
          .filter((message) => message.text.length > 0 || message.attachment)

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

  useEffect(() => {
    if (!authSession || !isFirebaseConfigured || !db || !activeRoomId) {
      return
    }

    const receiptsCollection = collection(db, 'rooms', activeRoomId, 'readReceipts')
    const unsubscribe = onSnapshot(
      receiptsCollection,
      (snapshot) => {
        const nextReceipts = snapshot.docs
          .map((receiptDoc) => {
            const data = receiptDoc.data() as StoredReadReceipt
            const userId = typeof data.userId === 'string' ? data.userId : receiptDoc.id
            const lastReadMessageId =
              typeof data.lastReadMessageId === 'string' ? data.lastReadMessageId : ''

            return {
              userId,
              lastReadMessageId,
            }
          })
          .filter((receipt) => receipt.lastReadMessageId.length > 0)

        setReadReceipts(nextReceipts)
      },
      () => {
        setAdminNotice('읽음 상태를 불러오지 못했습니다.')
      },
    )

    return unsubscribe
  }, [activeRoomId, authSession])

  useEffect(() => {
    if (!authSession || !isFirebaseConfigured || !db || !activeRoomId) {
      return
    }

    const latestMessage = visibleMessages.at(-1)

    if (!latestMessage) {
      return
    }

    const readKey = `${activeRoomId}:${latestMessage.id}`

    if (lastMarkedReadRef.current === readKey) {
      return
    }

    lastMarkedReadRef.current = readKey

    void setDoc(
      doc(db, 'rooms', activeRoomId, 'readReceipts', authSession.uid),
      {
        userId: authSession.uid,
        lastReadMessageId: latestMessage.id,
        updatedAt: serverTimestamp(),
        expiresAt: getRetentionExpiresAt(activeRoom?.retentionPolicy ?? defaultRetentionPolicy),
      },
      { merge: true },
    ).catch(() => {
      setAdminNotice('읽음 상태를 저장하지 못했습니다.')
    })
  }, [activeRoom?.retentionPolicy, activeRoomId, authSession, visibleMessages])

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

    if (!isFirebaseConfigured || !auth || !db) {
      setAuthError('서비스 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.')
      setConnectionState('error')
      return
    }

    setIsAuthSubmitting(true)

    try {
      if (authMode === 'reset') {
        await sendPasswordResetEmail(auth, email)
        setAuthMessage('비밀번호 재설정 메일을 보냈습니다.')
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
          photoURL: user.photoURL ?? '',
          photoPath: '',
        })
        setConnectionState('connecting')
        return
      }

      const { user } = await signInWithEmailAndPassword(auth, email, password)
      const session = await buildSessionFromUser(user)

      setAuthSession(session)
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
      if (!isFirebaseConfigured || !db || !auth?.currentUser) {
        setAuthError('연결 상태를 확인해주세요.')
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

  const openSettings = () => {
    if (!authSession) {
      return
    }

    setSettingsNickname(authSession.nickname)
    setSettingsCurrentPassword('')
    setSettingsNewPassword('')
    setSettingsConfirmPassword('')
    setDeletePassword('')
    setDeleteConfirmText('')
    setSettingsError('')
    setSettingsNotice('')
    setProfileImageProgress(0)
    setIsSettingsOpen(true)
  }

  const closeSettings = () => {
    if (isSettingsSubmitting || isProfileImageUploading) {
      return
    }

    setIsSettingsOpen(false)
  }

  const reauthenticateCurrentUser = async (password: string) => {
    if (!auth?.currentUser?.email) {
      throw new Error('현재 로그인 정보를 확인할 수 없습니다.')
    }

    const credential = EmailAuthProvider.credential(auth.currentUser.email, password)

    await reauthenticateWithCredential(auth.currentUser, credential)
  }

  const handleSettingsNicknameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!authSession || !auth?.currentUser || !db) {
      setSettingsError('연결 상태를 확인해주세요.')
      return
    }

    const nickname = settingsNickname.trim()

    setSettingsError('')
    setSettingsNotice('')

    if (nickname.length < 2) {
      setSettingsError('닉네임은 2자 이상으로 입력해주세요.')
      return
    }

    setIsSettingsSubmitting(true)

    try {
      await updateProfile(auth.currentUser, { displayName: nickname })
      await saveUserProfile(authSession.uid, authSession.email, nickname)
      setAuthSession({ ...authSession, nickname })
      setSettingsNotice('닉네임을 변경했습니다.')
    } catch (error) {
      setSettingsError(getAuthErrorMessage(error))
    } finally {
      setIsSettingsSubmitting(false)
    }
  }

  const uploadProfileImage = (file: File, path: string) =>
    new Promise<UploadTaskSnapshot>((resolve, reject) => {
      if (!fileStorage) {
        reject(new Error('File upload is not available.'))
        return
      }

      const task = uploadBytesResumable(storageRef(fileStorage, path), file, {
        contentType: file.type,
        customMetadata: {
          uploadedBy: authSession?.uid ?? '',
          purpose: 'profile',
        },
      })

      task.on(
        'state_changed',
        (snapshot) => {
          const progress =
            snapshot.totalBytes > 0
              ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
              : 0

          setProfileImageProgress(progress)
        },
        reject,
        () => resolve(task.snapshot),
      )
    })

  const handleProfileImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    event.target.value = ''

    if (!file) {
      return
    }

    if (!authSession || !auth?.currentUser || !db || !fileStorage) {
      setSettingsError('파일 업로드 상태를 확인해주세요.')
      return
    }

    setSettingsError('')
    setSettingsNotice('')

    if (!file.type.startsWith('image/')) {
      setSettingsError('이미지 파일만 등록할 수 있습니다.')
      return
    }

    if (file.size > maxProfileImageBytes) {
      setSettingsError('프로필 사진은 5MB 이하만 등록할 수 있습니다.')
      return
    }

    setIsProfileImageUploading(true)
    setProfileImageProgress(0)

    try {
      const path = createProfileImagePath(authSession.uid, file.name)
      const snapshot = await uploadProfileImage(file, path)
      const photoURL = await getDownloadURL(snapshot.ref)
      const previousPhotoPath = authSession.photoPath

      await updateProfile(auth.currentUser, { photoURL })
      await setDoc(
        doc(db, 'users', authSession.uid),
        {
          photoURL,
          photoPath: path,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setAuthSession({ ...authSession, photoURL, photoPath: path })
      setSettingsNotice('프로필 사진을 변경했습니다.')
      setProfileImageProgress(100)

      if (previousPhotoPath) {
        void deleteObject(storageRef(fileStorage, previousPhotoPath)).catch(() => undefined)
      }
    } catch {
      setSettingsError('프로필 사진을 변경하지 못했습니다.')
    } finally {
      setIsProfileImageUploading(false)
    }
  }

  const handlePasswordChangeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setSettingsError('')
    setSettingsNotice('')

    if (!settingsCurrentPassword) {
      setSettingsError('현재 비밀번호를 입력해주세요.')
      return
    }

    if (settingsNewPassword.length < 6) {
      setSettingsError('새 비밀번호는 6자 이상으로 입력해주세요.')
      return
    }

    if (settingsNewPassword !== settingsConfirmPassword) {
      setSettingsError('새 비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setIsSettingsSubmitting(true)

    try {
      await reauthenticateCurrentUser(settingsCurrentPassword)

      if (!auth?.currentUser) {
        throw new Error('현재 로그인 정보를 확인할 수 없습니다.')
      }

      await updatePassword(auth.currentUser, settingsNewPassword)
      setSettingsCurrentPassword('')
      setSettingsNewPassword('')
      setSettingsConfirmPassword('')
      setSettingsNotice('비밀번호를 변경했습니다.')
    } catch (error) {
      setSettingsError(getAuthErrorMessage(error))
    } finally {
      setIsSettingsSubmitting(false)
    }
  }

  const handleDeleteAccountSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!authSession || !auth?.currentUser || !db) {
      setSettingsError('연결 상태를 확인해주세요.')
      return
    }

    setSettingsError('')
    setSettingsNotice('')

    if (!deletePassword) {
      setSettingsError('현재 비밀번호를 입력해주세요.')
      return
    }

    if (deleteConfirmText.trim() !== '탈퇴') {
      setSettingsError('확인 문구를 입력해주세요.')
      return
    }

    setIsSettingsSubmitting(true)

    try {
      await reauthenticateCurrentUser(deletePassword)

      if (authSession.photoPath && fileStorage) {
        await deleteObject(storageRef(fileStorage, authSession.photoPath)).catch(() => undefined)
      }

      await deleteDoc(doc(db, 'users', authSession.uid))
      await deleteUser(auth.currentUser)
      setIsSettingsOpen(false)
      setAuthSession(null)
      setChatRooms([])
      setRemoteMessages([])
      setReadReceipts([])
      setManagedUsers([])
      setActiveRoomId('')
      setMobileTab('chats')
      setIsMobileChatOpen(false)
      setRetentionRoomId('')
    } catch (error) {
      setSettingsError(getAuthErrorMessage(error))
    } finally {
      setIsSettingsSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setRemoteMessages([])
    setReadReceipts([])
    setAuthError('')
    setAuthMessage('')
    setDraft('')
    setAdminNotice('')
    setMobileTab('chats')
    setIsMobileChatOpen(false)
    setRetentionRoomId('')

    if (isFirebaseConfigured && auth) {
      await signOut(auth)
      setConnectionState('connecting')
      return
    }

    setAuthSession(null)
    setChatRooms([])
    setRemoteMessages([])
    setReadReceipts([])
    setManagedUsers([])
    setActiveRoomId('')
    setMobileTab('chats')
    setIsMobileChatOpen(false)
    setRetentionRoomId('')
    setConnectionState('error')
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
    setMobileTab('chats')
    setIsMobileChatOpen(true)
    setConnectionState('connecting')
    setRemoteMessages([])
    setReadReceipts([])
  }

  const handleMobileTabChange = (nextTab: MobileTab) => {
    setMobileTab(nextTab)
    setIsMobileChatOpen(false)
    setActiveRoomId('')
    setRemoteMessages([])
    setReadReceipts([])
    setDraft('')
  }

  const handleBackToRoomList = () => {
    setMobileTab('chats')
    setIsMobileChatOpen(false)
    setActiveRoomId('')
    setRemoteMessages([])
    setReadReceipts([])
    setDraft('')
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
      setRetentionRoomId(existingRoom.id)
      setMobileTab('chats')
      setIsMobileChatOpen(true)
      setRemoteMessages([])
      setReadReceipts([])
      setAdminNotice(`${targetUser.nickname}님과의 기존 대화방을 열었습니다.`)
      return
    }

    const participantIds = [authSession.uid, targetUser.id]
    const subtitle = `${authSession.nickname}님이 시작한 1:1 대화`

    try {
      if (!isFirebaseConfigured || !db) {
        setConnectionState('error')
        setAdminNotice('연결 상태를 확인해주세요.')
        return
      }

      const roomDoc = await addDoc(collection(db, 'rooms'), {
        name: targetUser.nickname,
        subtitle,
        status: '1:1',
        type: 'direct',
        retentionPolicy: defaultRetentionPolicy,
        participantIds,
        createdBy: authSession.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      setActiveRoomId(roomDoc.id)
      setRetentionRoomId(roomDoc.id)
      setMobileTab('chats')
      setIsMobileChatOpen(true)
      setConnectionState('connecting')
      setReadReceipts([])
      setAdminNotice(`${targetUser.nickname}님과의 대화를 시작했습니다.`)
    } catch {
      setAdminNotice('대화방을 만들지 못했습니다. 권한을 확인해주세요.')
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

    const participantIds = [authSession.uid, ...selectedGroupMemberIds]
    const subtitle = `${authSession.nickname}님이 만든 단톡방`

    try {
      if (!isFirebaseConfigured || !db) {
        setConnectionState('error')
        setAdminNotice('연결 상태를 확인해주세요.')
        return
      }

      const roomDoc = await addDoc(collection(db, 'rooms'), {
        name: roomName,
        subtitle,
        status: '단톡',
        type: 'group',
        retentionPolicy: defaultRetentionPolicy,
        participantIds,
        createdBy: authSession.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      setGroupName('')
      setActiveRoomId(roomDoc.id)
      setRetentionRoomId(roomDoc.id)
      setMobileTab('chats')
      setIsMobileChatOpen(true)
      setConnectionState('connecting')
      setReadReceipts([])
      setAdminNotice(`${roomName} 단톡방을 만들었습니다.`)
    } catch {
      setAdminNotice('단톡방을 만들지 못했습니다. 권한을 확인해주세요.')
    }
  }

  const handleToggleUserStatus = async (user: ManagedUser) => {
    if (!isAdmin) {
      return
    }

    const nextStatus: UserStatus = user.status === 'active' ? 'blocked' : 'active'

    try {
      if (!isFirebaseConfigured || !db) {
        setConnectionState('error')
        setAdminNotice('연결 상태를 확인해주세요.')
        return
      }

      await setDoc(
        doc(db, 'users', user.id),
        {
          status: nextStatus,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
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
      if (!isFirebaseConfigured || !db) {
        setConnectionState('error')
        setAdminNotice('연결 상태를 확인해주세요.')
        return
      }

      await setDoc(
        doc(db, 'users', user.id),
        {
          role: nextRole,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setAdminNotice(`${user.nickname}님 권한을 ${roleCopy[nextRole]}으로 변경했습니다.`)
    } catch {
      setAdminNotice('유저 권한을 변경하지 못했습니다.')
    }
  }

  const handleUpdateRoomRetention = async (roomId: string, nextPolicy: RetentionPolicy) => {
    if (!isAdmin) {
      setAdminNotice('관리자만 삭제 정책을 변경할 수 있습니다.')
      return
    }

    const targetRoom = chatRooms.find((room) => room.id === roomId)

    if (!targetRoom) {
      setAdminNotice('삭제 정책을 설정할 채팅방을 선택해주세요.')
      return
    }

    try {
      if (!isFirebaseConfigured || !db) {
        setConnectionState('error')
        setAdminNotice('연결 상태를 확인해주세요.')
        return
      }

      await setDoc(
        doc(db, 'rooms', roomId),
        {
          retentionPolicy: nextPolicy,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
      setRetentionRoomId(roomId)
      setAdminNotice(`${targetRoom.name} 삭제 정책을 ${retentionCopy[nextPolicy]}로 변경했습니다.`)
    } catch {
      setAdminNotice('삭제 정책을 변경하지 못했습니다.')
    }
  }

  const uploadStorageFile = (
    file: File,
    path: string,
    fileIndex: number,
    fileCount: number,
  ) =>
    new Promise<UploadTaskSnapshot>((resolve, reject) => {
      if (!fileStorage) {
        reject(new Error('File upload is not available.'))
        return
      }

      const task = uploadBytesResumable(storageRef(fileStorage, path), file, {
        contentType: file.type || 'application/octet-stream',
        customMetadata: {
          roomId: activeRoomId,
          uploadedBy: authSession?.uid ?? '',
        },
      })

      task.on(
        'state_changed',
        (snapshot) => {
          const fileProgress =
            snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0
          const totalProgress = Math.round(((fileIndex + fileProgress) / fileCount) * 100)

          setUploadProgress(totalProgress)
        },
        reject,
        () => resolve(task.snapshot),
      )
    })

  const handleUploadFiles = async (files: File[]) => {
    const selectedFiles = files.filter((file) => file.size > 0)

    if (selectedFiles.length === 0) {
      return
    }

    if (!authSession || !activeRoomId || !canSendMessage) {
      setUploadNotice('현재 채팅방에는 파일을 보낼 수 없습니다.')
      return
    }

    if (!db || !fileStorage || !auth?.currentUser) {
      setConnectionState('error')
      setUploadNotice('파일 전송 상태를 확인해주세요.')
      return
    }

    const validFiles = selectedFiles.filter((file) => file.size <= maxAttachmentBytes)

    if (validFiles.length !== selectedFiles.length) {
      setUploadNotice('20MB 이하 파일만 보낼 수 있습니다.')
    }

    if (validFiles.length === 0) {
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    try {
      const messageRetentionPolicy = activeRoom?.retentionPolicy ?? defaultRetentionPolicy

      for (const [index, file] of validFiles.entries()) {
        const path = createUploadPath(activeRoomId, auth.currentUser.uid, file.name)
        const snapshot = await uploadStorageFile(file, path, index, validFiles.length)
        const url = await getDownloadURL(snapshot.ref)
        const contentType = file.type || 'application/octet-stream'
        const attachment: MessageAttachment = {
          kind: contentType.startsWith('image/') ? 'image' : 'file',
          name: file.name,
          url,
          path,
          contentType,
          size: file.size,
        }

        await addDoc(collection(db, 'rooms', activeRoomId, 'messages'), {
          roomId: activeRoomId,
          authorId: auth.currentUser.uid,
          authorName: authSession.nickname,
          text: file.name,
          attachment,
          createdAt: serverTimestamp(),
          expiresAt: getRetentionExpiresAt(messageRetentionPolicy),
        })
      }

      setUploadNotice('파일을 보냈습니다.')
      setUploadProgress(100)
    } catch {
      setConnectionState('error')
      setUploadNotice('파일을 보내지 못했습니다. 권한을 확인해주세요.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])

    event.target.value = ''
    void handleUploadFiles(files)
  }

  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) {
      return
    }

    event.preventDefault()
    dragDepthRef.current += 1

    if (canSendMessage) {
      setIsDraggingFile(true)
    }
  }

  const handleDragOver = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = canSendMessage ? 'copy' : 'none'
  }

  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) {
      return
    }

    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)

    if (dragDepthRef.current === 0) {
      setIsDraggingFile(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) {
      return
    }

    event.preventDefault()
    dragDepthRef.current = 0
    setIsDraggingFile(false)
    void handleUploadFiles(Array.from(event.dataTransfer.files))
  }

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const text = draft.trim()

    if (!text || !authSession || !canSendMessage || !activeRoomId) {
      return
    }

    if (!isFirebaseConfigured || !db || !auth?.currentUser) {
      setConnectionState('error')
      setAdminNotice('연결 상태를 확인해주세요.')
      return
    }

    try {
      await addDoc(collection(db, 'rooms', activeRoomId, 'messages'), {
        roomId: activeRoomId,
        authorId: auth.currentUser.uid,
        authorName: authSession.nickname,
        text,
        createdAt: serverTimestamp(),
        expiresAt: getRetentionExpiresAt(activeRoom?.retentionPolicy ?? defaultRetentionPolicy),
      })
      setDraft('')
    } catch {
      setConnectionState('error')
      setAdminNotice('메시지를 보내지 못했습니다. 권한을 확인해주세요.')
    }
  }

  if (!isFirebaseConfigured) {
    return (
      <main className="auth-shell">
        <section className="auth-card auth-loading" aria-live="polite">
          <span className="brand-mark auth-brand">
            <ShieldCheck size={28} strokeWidth={2.4} />
          </span>
          <h1>서비스 준비 필요</h1>
          <p className="form-message is-error">
            서비스 설정이 완료되지 않았습니다. 관리자에게 문의해주세요.
          </p>
        </section>
      </main>
    )
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
                  로그인, 데이터 보관, 서비스 제공을 위해 이메일, 닉네임,
                  서비스 이용 기록이 처리될 수 있습니다.
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

  const renderAdminConsole = (variant: 'desktop' | 'mobile') => {
    const selectedRetentionRoomId = retentionTargetRoom?.id ?? ''

    return (
      <div className={`admin-console is-${variant}`}>
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
          <button
            className={adminPanel === 'retention' ? 'is-active' : ''}
            type="button"
            onClick={() => openAdminPanel('retention')}
          >
            삭제
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

        {adminPanel === 'retention' && (
          <div className="admin-form retention-form">
            <label className="field">
              <span>설정할 채팅방</span>
              <select
                value={selectedRetentionRoomId}
                onChange={(event) => setRetentionRoomId(event.target.value)}
                disabled={chatRooms.length === 0}
              >
                {chatRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name} · {retentionCopy[room.retentionPolicy]}
                  </option>
                ))}
              </select>
            </label>
            <div className="retention-options" role="radiogroup" aria-label="삭제 정책">
              {(['oneDay', 'oneMonth'] as RetentionPolicy[]).map((policy) => (
                <button
                  className={retentionTargetRoom?.retentionPolicy === policy ? 'is-active' : ''}
                  key={policy}
                  type="button"
                  onClick={() => void handleUpdateRoomRetention(selectedRetentionRoomId, policy)}
                  disabled={!selectedRetentionRoomId}
                  aria-pressed={retentionTargetRoom?.retentionPolicy === policy}
                >
                  <strong>{retentionCopy[policy]}</strong>
                  <small>{retentionDescription[policy]}</small>
                </button>
              ))}
            </div>
            <p className="retention-note">
              기본값은 1일 후 삭제입니다. 변경한 정책은 새로 저장되는 메시지부터 적용됩니다.
            </p>
          </div>
        )}
      </div>
    )
  }

  const renderActiveRoomRetentionControl = () => {
    if (!isAdmin || !activeRoom) {
      return null
    }

    return (
      <div className="chat-retention-control" role="radiogroup" aria-label="현재 채팅방 삭제 정책">
        {(['oneDay', 'oneMonth'] as RetentionPolicy[]).map((policy) => (
          <button
            className={activeRoom.retentionPolicy === policy ? 'is-active' : ''}
            key={policy}
            type="button"
            onClick={() => void handleUpdateRoomRetention(activeRoom.id, policy)}
            aria-pressed={activeRoom.retentionPolicy === policy}
            title={retentionDescription[policy]}
          >
            {policy === 'oneDay' ? '1일 후' : '1달 후'}
          </button>
        ))}
      </div>
    )
  }

  return (
    <main
      className={`app-shell is-mobile-tab-${mobileTab} ${
        isMobileChatOpen && activeRoom ? 'is-mobile-chat-open' : 'is-mobile-list-open'
      }`}
    >
      <aside className="rail" aria-label="기본 메뉴">
        <button
          className="brand-mark"
          type="button"
          onClick={handleBackToRoomList}
          aria-label="홈"
          title="홈"
        >
          <MessageCircle size={25} strokeWidth={2.4} />
        </button>
        <nav className="rail-nav">
          <button
            className="rail-button is-active"
            type="button"
            onClick={handleBackToRoomList}
            aria-label="채팅"
            title="채팅"
          >
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
          <button
            className="rail-button"
            type="button"
            onClick={openSettings}
            aria-label="설정"
            title="설정"
          >
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
            <button type="button" onClick={() => openAdminPanel('retention')}>
              <Trash2 size={16} />
              삭제
            </button>
          </div>
        ) : (
          <p className="permission-note">기존 채팅방에서만 메시지를 보낼 수 있습니다.</p>
        )}

        {adminNotice && <p className="admin-notice">{adminNotice}</p>}

        {isAdmin && <div className="mobile-admin-console">{renderAdminConsole('mobile')}</div>}

        <div className="room-list">
          {filteredRooms.length > 0 ? (
            filteredRooms.map((room) => (
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
            ))
          ) : (
            <div className="room-empty">
              <MessageCircle size={28} />
              <p>표시할 채팅방이 없습니다.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mobile-tab-page is-friends" aria-label="친구">
        <div className="mobile-page-heading">
          <div>
            <p className="eyebrow">GreenTalk</p>
            <h1>친구</h1>
          </div>
          <button className="icon-button" type="button" onClick={openSettings} aria-label="내 프로필">
            <UserRound size={20} />
          </button>
        </div>
        <div className="mobile-page-list">
          <button className="mobile-page-row" type="button" onClick={openSettings}>
            <span
              className="avatar"
              style={{ backgroundColor: authSession.photoURL ? '#12342d' : '#06c755' }}
            >
              {authSession.nickname.slice(0, 1)}
            </span>
            <span className="mobile-page-copy">
              <strong>{authSession.nickname}</strong>
              <small>내 프로필</small>
            </span>
          </button>
          {mobileDirectRooms.length > 0 ? (
            mobileDirectRooms.map((room) => (
              <button
                className="mobile-page-row"
                key={room.id}
                type="button"
                onClick={() => handleSelectRoom(room.id)}
              >
                <span className="avatar" style={{ backgroundColor: room.accent }}>
                  {room.name.slice(0, 1)}
                </span>
                <span className="mobile-page-copy">
                  <strong>{room.name}</strong>
                  <small>{room.status}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="mobile-page-empty">
              <UserRound size={28} />
              <p>표시할 친구가 없습니다.</p>
            </div>
          )}
        </div>
      </section>

      <section className="mobile-tab-page is-news" aria-label="뉴스">
        <div className="mobile-page-heading">
          <div>
            <p className="eyebrow">GreenTalk</p>
            <h1>뉴스</h1>
          </div>
        </div>
        <div className="mobile-page-list">
          <article className="mobile-news-card">
            <strong>오늘의 소식</strong>
            <p>새 알림이 없습니다.</p>
          </article>
          <article className="mobile-news-card">
            <strong>파일 공유</strong>
            <p>새 파일 소식이 없습니다.</p>
          </article>
        </div>
      </section>

      <section className="mobile-tab-page is-calls" aria-label="통화">
        <div className="mobile-page-heading">
          <div>
            <p className="eyebrow">GreenTalk</p>
            <h1>통화</h1>
          </div>
        </div>
        <div className="mobile-page-list">
          {chatRooms.length > 0 ? (
            chatRooms.map((room) => (
              <button
                className="mobile-page-row"
                key={room.id}
                type="button"
                onClick={() => handleSelectRoom(room.id)}
              >
                <span className="avatar" style={{ backgroundColor: room.accent }}>
                  <Phone size={18} />
                </span>
                <span className="mobile-page-copy">
                  <strong>{room.name}</strong>
                  <small>{room.status}</small>
                </span>
              </button>
            ))
          ) : (
            <div className="mobile-page-empty">
              <Phone size={28} />
              <p>표시할 통화가 없습니다.</p>
            </div>
          )}
        </div>
      </section>

      <section
        className={`conversation-panel ${isDraggingFile ? 'is-dragging-file' : ''}`}
        aria-label={activeRoom ? `${activeRoom.name} 대화` : '대화'}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingFile && (
          <div className="drop-overlay" aria-hidden="true">
            <UploadCloud size={34} />
            <span>여기에 놓으면 전송됩니다.</span>
          </div>
        )}
        <header className="chat-header">
          <div className="chat-title">
            <button
              className="mobile-back-button"
              type="button"
              onClick={handleBackToRoomList}
              aria-label="채팅 목록"
              title="채팅 목록"
            >
              <ArrowLeft size={20} />
            </button>
            <span
              className="avatar large"
              style={{ backgroundColor: activeRoom?.accent ?? '#7a8a84' }}
            >
              {(activeRoom?.name ?? 'G').slice(0, 1)}
            </span>
            <div>
              <h2>{activeRoom?.name ?? '채팅방 없음'}</h2>
              <p>
                {activeRoom
                  ? `${activeRoom.members} · ${activeRoom.status}`
                  : '관리자가 만든 채팅방이 표시됩니다.'}
              </p>
            </div>
          </div>
          {renderActiveRoomRetentionControl()}
          <div className="chat-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="음성 통화"
              title="음성 통화"
              disabled={!activeRoom}
            >
              <Phone size={19} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="영상 통화"
              title="영상 통화"
              disabled={!activeRoom}
            >
              <Video size={19} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="대화 정보"
              title="대화 정보"
              disabled={!activeRoom}
            >
              <Info size={19} />
            </button>
          </div>
        </header>

        <div className="message-list" aria-live="polite">
          {activeRoom && <div className="day-divider">오늘</div>}
          {!activeRoom ? (
            <div className="empty-state">
              <MessageCircle size={34} />
              <p>채팅방을 선택하거나 관리자가 새 대화를 만들어주세요.</p>
            </div>
          ) : visibleMessages.length > 0 ? (
            visibleMessages.map((message) => {
              const readCount = readBadgeByMessageId[message.id] ?? 0

              return (
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
                      {message.isMine && (
                        <span className="message-meta">
                          {readCount > 0 && (
                            <span className="read-receipt">
                              {readCount > 1 ? `읽음 ${readCount}` : '읽음'}
                            </span>
                          )}
                          <span className="message-time">{message.time}</span>
                        </span>
                      )}
                      {message.attachment ? (
                        <a
                          className={`attachment-card is-${message.attachment.kind}`}
                          href={message.attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          download={message.attachment.name}
                        >
                          {message.attachment.kind === 'image' ? (
                            <img src={message.attachment.url} alt={message.attachment.name} />
                          ) : (
                            <span className="attachment-icon">
                              <FileText size={20} />
                            </span>
                          )}
                          <span className="attachment-copy">
                            <strong>{message.attachment.name}</strong>
                            <small>
                              {formatFileSize(message.attachment.size)}
                              <Download size={13} />
                            </small>
                          </span>
                        </a>
                      ) : (
                        <p className="message-bubble">{message.text}</p>
                      )}
                      {!message.isMine && <span className="message-time">{message.time}</span>}
                    </div>
                  </div>
                </article>
              )
            })
          ) : (
            <div className="empty-state">
              <MessageCircle size={34} />
              <p>아직 메시지가 없습니다. 첫 메시지를 보내보세요.</p>
            </div>
          )}
        </div>

        {(isUploading || uploadNotice) && (
          <div className="upload-status" role="status">
            <span>{isUploading ? `업로드 중 ${uploadProgress}%` : uploadNotice}</span>
            {isUploading && (
              <span className="upload-meter" aria-hidden="true">
                <span style={{ width: `${uploadProgress}%` }} />
              </span>
            )}
          </div>
        )}

        <form className="composer" onSubmit={handleSend}>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            multiple
            onChange={handleFileInputChange}
          />
          <input
            ref={imageInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileInputChange}
          />
          <div className="composer-tools">
            <button
              type="button"
              aria-label="파일 첨부"
              title="파일 첨부"
              disabled={!canSendMessage}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={19} />
            </button>
            <button
              type="button"
              aria-label="이미지 첨부"
              title="이미지 첨부"
              disabled={!canSendMessage}
              onClick={() => imageInputRef.current?.click()}
            >
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
              !activeRoom
                ? '채팅방을 선택해주세요.'
                : canSendMessage
                  ? `${activeRoom.name}에 메시지 보내기`
                  : connectionState === 'error'
                    ? '연결 상태를 확인해주세요.'
                    : '차단된 계정은 메시지를 보낼 수 없습니다.'
            }
            aria-label="메시지 입력"
          />
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
          <span
            className="profile-avatar"
            style={{ backgroundColor: activeRoom?.accent ?? '#7a8a84' }}
          >
            {(activeRoom?.name ?? 'G').slice(0, 1)}
          </span>
          <h2>{activeRoom?.name ?? '채팅방 없음'}</h2>
          <p>{activeRoom?.subtitle ?? '채팅방 정보가 여기에 표시됩니다.'}</p>
          <div className="profile-actions">
            <button type="button" aria-label="통화" title="통화" disabled={!activeRoom}>
              <Phone size={18} />
            </button>
            <button type="button" aria-label="영상" title="영상" disabled={!activeRoom}>
              <Video size={18} />
            </button>
            <button type="button" aria-label="검색" title="검색" disabled={!activeRoom}>
              <Search size={18} />
            </button>
          </div>
        </div>

        {isAdmin ? (
          renderAdminConsole('desktop')
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

      <nav className="mobile-tab-bar" aria-label="모바일 하단 메뉴">
        <button
          className={mobileTab === 'friends' ? 'is-active' : ''}
          type="button"
          onClick={() => handleMobileTabChange('friends')}
          aria-label="친구"
        >
          <UserRound size={21} />
          <span>친구</span>
        </button>
        <button
          className={mobileTab === 'chats' ? 'is-active' : ''}
          type="button"
          onClick={() => handleMobileTabChange('chats')}
          aria-label="대화"
        >
          <MessageCircle size={21} />
          <span>대화</span>
        </button>
        <button
          className={mobileTab === 'news' ? 'is-active' : ''}
          type="button"
          onClick={() => handleMobileTabChange('news')}
          aria-label="뉴스"
        >
          <Newspaper size={21} />
          <span>뉴스</span>
        </button>
        <button
          className={mobileTab === 'calls' ? 'is-active' : ''}
          type="button"
          onClick={() => handleMobileTabChange('calls')}
          aria-label="통화"
        >
          <Phone size={21} />
          <span>통화</span>
        </button>
      </nav>

      {isSettingsOpen && (
        <div className="settings-backdrop" role="presentation">
          <section className="settings-dialog" aria-label="프로필 설정">
            <header className="settings-header">
              <div>
                <p className="eyebrow">GreenTalk</p>
                <h2>프로필 설정</h2>
              </div>
              <button className="icon-button" type="button" onClick={closeSettings} aria-label="닫기">
                <X size={20} />
              </button>
            </header>

            <div className="settings-profile">
              <span className="settings-avatar">
                {authSession.photoURL ? (
                  <img src={authSession.photoURL} alt={authSession.nickname} />
                ) : (
                  authSession.nickname.slice(0, 1)
                )}
              </span>
              <div>
                <strong>{authSession.nickname}</strong>
                <span>{authSession.email}</span>
              </div>
              <input
                ref={profileImageInputRef}
                className="visually-hidden"
                type="file"
                accept="image/*"
                onChange={handleProfileImageChange}
              />
              <button
                className="settings-tool-button"
                type="button"
                disabled={isProfileImageUploading || isSettingsSubmitting}
                onClick={() => profileImageInputRef.current?.click()}
              >
                <Camera size={17} />
                사진 변경
              </button>
            </div>

            {isProfileImageUploading && (
              <div className="upload-status is-settings" role="status">
                <span>사진 업로드 중 {profileImageProgress}%</span>
                <span className="upload-meter" aria-hidden="true">
                  <span style={{ width: `${profileImageProgress}%` }} />
                </span>
              </div>
            )}

            {settingsError && (
              <p className="form-message is-error" role="alert">
                {settingsError}
              </p>
            )}
            {settingsNotice && <p className="form-message is-success">{settingsNotice}</p>}

            <form className="settings-section" onSubmit={handleSettingsNicknameSubmit}>
              <div className="settings-section-title">
                <UserRound size={18} />
                <h3>닉네임</h3>
              </div>
              <label className="field">
                <span>닉네임</span>
                <div className="field-control">
                  <UserRound size={18} />
                  <input
                    value={settingsNickname}
                    onChange={(event) => setSettingsNickname(event.target.value)}
                    autoComplete="nickname"
                  />
                </div>
              </label>
              <button className="primary-button" type="submit" disabled={isSettingsSubmitting}>
                저장
              </button>
            </form>

            <form className="settings-section" onSubmit={handlePasswordChangeSubmit}>
              <div className="settings-section-title">
                <KeyRound size={18} />
                <h3>비밀번호</h3>
              </div>
              <label className="field">
                <span>현재 비밀번호</span>
                <div className="field-control">
                  <LockKeyhole size={18} />
                  <input
                    type="password"
                    value={settingsCurrentPassword}
                    onChange={(event) => setSettingsCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </label>
              <label className="field">
                <span>새 비밀번호</span>
                <div className="field-control">
                  <KeyRound size={18} />
                  <input
                    type="password"
                    value={settingsNewPassword}
                    onChange={(event) => setSettingsNewPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </label>
              <label className="field">
                <span>새 비밀번호 확인</span>
                <div className="field-control">
                  <KeyRound size={18} />
                  <input
                    type="password"
                    value={settingsConfirmPassword}
                    onChange={(event) => setSettingsConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </label>
              <button className="primary-button" type="submit" disabled={isSettingsSubmitting}>
                비밀번호 변경
              </button>
            </form>

            <form className="settings-section danger-zone" onSubmit={handleDeleteAccountSubmit}>
              <div className="settings-section-title">
                <Trash2 size={18} />
                <h3>계정 탈퇴</h3>
              </div>
              <label className="field">
                <span>현재 비밀번호</span>
                <div className="field-control">
                  <LockKeyhole size={18} />
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </label>
              <label className="field">
                <span>확인 문구</span>
                <div className="field-control">
                  <Trash2 size={18} />
                  <input
                    value={deleteConfirmText}
                    onChange={(event) => setDeleteConfirmText(event.target.value)}
                    placeholder="탈퇴"
                  />
                </div>
              </label>
              <button className="danger-button" type="submit" disabled={isSettingsSubmitting}>
                계정 탈퇴
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

export default App
