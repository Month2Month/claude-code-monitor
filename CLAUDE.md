# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm run dev           # 開発モード（ホットリロード付き）
npm run build         # TypeScriptコンパイル
npm start             # コンパイル済みJSを実行

# テスト
npm run test          # テスト実行（単発）
npm run test:watch    # テスト実行（ウォッチモード）
npm run test:coverage # カバレッジ付きテスト

# コード品質
npm run lint          # biomeでリントチェック
npm run lint:fix      # リント自動修正
npm run format        # コードフォーマット
npm run typecheck     # 型チェックのみ
```

## Architecture

Claude Codeの複数セッションをリアルタイム監視するmacOS専用CLIツール。Ink（React for CLI）を使用したTUIとファイルベースの状態管理で動作する。

### データフロー

1. **Hook受信**: Claude Codeがフックイベント（PreToolUse, PostToolUse, Notification, Stop, UserPromptSubmit）を発火
2. **状態更新**: `ccm hook <event>` コマンドがstdinからJSONを受け取り、`~/.claude-monitor/sessions.json` を更新
3. **UI更新**: chokidarでファイル変更を検知し、Dashboardコンポーネントが再描画

### ディレクトリ構成

- `src/bin/ccm.tsx` - CLIエントリーポイント（Commanderでコマンド定義）
- `src/hook/handler.ts` - フックイベント処理（stdin読み取り→状態更新）
- `src/store/file-store.ts` - セッション状態の永続化（JSON読み書き、タイムアウト管理）
- `src/setup/index.ts` - `~/.claude/settings.json` へのフック自動設定
- `src/components/` - InkベースのReactコンポーネント
- `src/hooks/useSessions.ts` - ファイル変更監視付きのReactフック
- `src/utils/focus.ts` - AppleScriptによるターミナルフォーカス機能
- `src/types/index.ts` - 型定義（HookEvent, Session, SessionStatus, StoreData）

### 技術スタック

- **UI**: Ink v5 + React 18
- **CLI**: Commander
- **ファイル監視**: chokidar
- **ターミナル制御**: AppleScript（iTerm2, Terminal.app, Ghostty対応）
- **テスト**: Vitest
- **リント/フォーマット**: Biome

### セッション管理

セッションは`session_id:tty`の形式でキー管理される。同一TTYに新しいセッションが開始されると、古いセッションは自動削除される。

**状態遷移**:
- `running`: ツール実行中（PreToolUse, UserPromptSubmitで遷移）
- `waiting_input`: 権限許可などの入力待ち（Notification + permission_promptで遷移）
- `stopped`: セッション終了（Stopで遷移）

セッションは30分でタイムアウト、またはTTYが存在しなくなると自動削除される。

### ライブラリとしての使用

```typescript
import { getSessions, getStatusDisplay } from 'claude-code-monitor';
```

`src/index.ts`で公開APIをエクスポートしている。
