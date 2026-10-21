import React from "react";
import ConversationPanel from "./components/conversation/ConversationPanel.jsx";
import InterchangePanel from "./components/interchange/InterchangePanel.jsx";
import SessionMenu from "./components/layout/SessionMenu.jsx";
import { useSession } from "./state/useSession.js";

export default function App() {
  const session = useSession();

  return (
    <div className="app" data-area="app">
      <header className="app-header" data-area="header">
        <h1 className="app-title">NEXUS</h1>
        <span className="app-tagline">
          Your structured interface between you and AI
        </span>
        <SessionMenu onNewSession={session.resetSession} />
      </header>

      <main className="app-main">
        <ConversationPanel
          messages={session.messages}
          onSend={session.sendUserMessage}
          lastResponse={session.lastResponse}
          uiState={session.uiState}
          onUiStateChange={session.updateUiState}
        />

        <InterchangePanel
          prompt={session.prompt}
          promptSections={session.promptSections}
          contextPackage={session.contextPackage}
          contextFingerprint={session.contextFingerprint}
          contextVersion={session.contextVersion}
          continuationPrompt={session.continuationPrompt}
          instruction={session.instruction}
          onInstructionChange={session.updateInstruction}
          onInstructionReset={session.resetInstruction}
          onSubmitResponse={session.submitResponse}
          validationErrors={session.validationErrors}
        />
      </main>
    </div>
  );
}