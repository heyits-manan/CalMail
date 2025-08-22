# Voice Assistant Confirmation Flow

## Overview

The CalMail voice assistant now implements a **two-phase confirmation flow** that gives users full control over command execution and ensures the AI understood them correctly before taking any actions.

## How It Works

### Phase 1: Understanding

1. **Voice Input**: User speaks into the microphone
2. **Text Input**: User types a command manually
3. **Processing**: The command is sent to the backend for NLU (Natural Language Understanding)
4. **Display**: The transcript and NLU result are shown to the user

### Phase 2: Confirmation & Execution

1. **Review**: User sees exactly what the AI understood
2. **Confirm**: User can confirm, reject, or try again
3. **Execute**: Only after confirmation is the command sent to the `/command` endpoint

## User Experience

### When Recording Voice

- User taps "Start Listening" and speaks
- Audio is processed and transcribed
- User sees the transcript and what the AI understood
- User can confirm, cancel, or try again

### When Typing Text

- User types a command in the text input
- Command is processed for NLU
- User sees the interpretation before execution
- User can confirm, cancel, or edit the text

### Confirmation Options

- **Confirm**: Execute the command as understood
- **Cancel**: Discard the command entirely
- **Try Again**: Pre-fill the text input with the transcript for manual editing

### Google Account Management

- **Connect**: OAuth flow to connect Google account
- **Disconnect**: Securely remove Google account access with confirmation
- **Status Check**: Real-time connection status using `/me` endpoint
- **Auto-refresh**: Status updates automatically when app becomes active

## Technical Implementation

### State Variables

- `isLoading`: Shows when processing is happening
- `transcript`: The user's original input (voice or text)
- `nluResult`: The AI's understanding of the command

### Key Functions

- `handleTextCommand()`: Processes text input (Phase 1)
- `uploadRecording()`: Processes voice input (Phase 1)
- `handleConfirmCommand()`: Executes confirmed command (Phase 2)
- `handleCancelCommand()`: Cancels the command
- `handleTryAgain()`: Allows user to retry with editing

### UI States

- **Input Mode**: Shows text input and voice recording when no command is pending
- **Confirmation Mode**: Shows transcript, NLU result, and confirmation buttons
- **Loading States**: Visual feedback during processing and execution

## Benefits

1. **User Control**: Users have full control over command execution
2. **Error Prevention**: Commands are only executed after user confirmation
3. **Transparency**: Users see exactly what the AI understood
4. **Correction**: Users can edit or retry if the AI misunderstood
5. **Safety**: Prevents accidental execution of misunderstood commands

## Backend Requirements

The backend endpoints should return:

### `/transcribe` (Voice Commands)

```json
{
  "success": true,
  "nluResult": {
    "intent": "send_email",
    "entities": {
      "recipient": "nirajan",
      "body": "how are you doing"
    }
  },
  "executionResult": {
    "success": true,
    "message": "Email successfully sent to nirajanbaij@gmail.com",
    "resolvedEmail": "nirajanbaij@gmail.com",
    "originalRecipient": "nirajan",
    "confidence": "high",
    "source": "email_history"
  }
}
```

### `/process-text` (Text Commands)

```json
{
  "intent": "send_email",
  "entities": {
    "recipient": "nirajan",
    "body": "how are you doing"
  }
}
```

### `/me` (Google Account Status)

```json
{
  "emailAddress": "user@gmail.com",
  "name": "User Name",
  "picture": "https://...",
  "connected": true
}
```

### `/auth/google/disconnect` (Disconnect Google Account)

```json
DELETE /auth/google/disconnect
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Google account disconnected successfully"
}
```

### `/command` (Optional - for manual execution)

Execute the confirmed command if not already executed by the backend.

**Note**: The current backend implementation appears to execute commands immediately and return results. The frontend now handles both scenarios:

1. **Immediate execution**: Shows results from backend
2. **Manual confirmation**: Sends to `/command` endpoint if needed
