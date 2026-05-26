# GreenTalk

LINE 느낌의 가벼운 실시간 채팅 웹앱 MVP입니다. Vite + React로 화면을 만들고, Firebase Auth 익명 로그인과 Firestore 실시간 구독을 사용합니다. Firebase 환경변수가 없으면 로컬 데모 메시지로 실행됩니다.

## 실행

```bash
npm install
npm run dev
```

## Firebase 설정

1. Firebase 콘솔에서 Web App을 만들고 Authentication의 Anonymous 로그인을 켭니다.
2. Cloud Firestore 데이터베이스를 생성합니다.
3. `.env.example`을 기준으로 `.env.local`을 만들고 값을 채웁니다.

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

메시지는 `rooms/{roomId}/messages` 하위 컬렉션에 저장됩니다.

## Vercel 배포

Vercel 프로젝트의 Environment Variables에 위 `VITE_FIREBASE_*` 값을 추가한 뒤 배포하면 됩니다. 이 저장소에는 Vite 정적 빌드를 위한 `vercel.json`이 포함되어 있습니다.

## Firestore Rules

초기 규칙은 `firestore.rules`에 있습니다. 익명 인증 사용자가 메시지를 생성하고 읽을 수 있으며, 수정과 삭제는 막아두었습니다.
