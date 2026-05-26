# GreenTalk

LINE 느낌의 가벼운 실시간 채팅 웹앱 MVP입니다. Vite + React로 화면을 만들고, Firebase Auth 이메일 로그인과 Cloud Firestore 실시간 구독만 사용합니다. 클라이언트에 기본 채팅방, 데모 유저, 데모 메시지를 두지 않으므로 모든 채팅 데이터는 Firestore에서 불러옵니다.

## 실행

```bash
npm install
npm run dev
```

## Firebase 설정

1. Firebase 콘솔에서 Web App을 만들고 Authentication의 Email/Password 로그인을 켭니다.
2. Cloud Firestore 데이터베이스를 생성합니다.
3. `.env`에 Firebase Web App 값을 채웁니다.

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

사용자 프로필과 동의 기록은 `users/{uid}` 문서에 저장됩니다. 신규 가입자는 기본 `role: "user"`로 생성됩니다.

관리자 계정은 Firebase 콘솔에서 해당 `users/{uid}` 문서의 `role`을 `"admin"`으로 바꿔서 지정합니다. 관리자만 유저 목록 조회, 유저 상태/권한 변경, 1:1 대화 시작, 단톡방 생성이 가능합니다.

메시지는 `rooms/{roomId}/messages` 하위 컬렉션에 저장됩니다. 일반 유저는 본인이 `participantIds`에 포함된 방에서만 메시지를 보낼 수 있습니다.

읽음 상태는 `rooms/{roomId}/readReceipts/{uid}` 문서에 사용자별 마지막 읽은 메시지 ID로 저장됩니다. 클라이언트는 상대가 읽은 범위 안에서 내가 보낸 가장 최근 메시지 옆에 `읽음` 표시를 보여줍니다.

## Vercel 배포

Vercel 프로젝트의 Environment Variables에 위 `VITE_FIREBASE_*` 값을 추가한 뒤 배포하면 됩니다. 이 저장소에는 Vite 정적 빌드를 위한 `vercel.json`이 포함되어 있습니다.

## Firestore Rules

초기 규칙은 `firestore.rules`에 있습니다. 일반 유저는 새 채팅방을 만들 수 없고, 관리자는 `rooms` 문서를 생성해 1:1 또는 단톡을 시작할 수 있습니다. 메시지 수정과 삭제는 막아두었습니다.
