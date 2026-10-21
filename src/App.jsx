import React from "react";
import ConversationPanel from "./components/conversation/ConversationPanel.jsx";
import InterchangePanel from "./components/interchange/InterchangePanel.jsx";
import DocumentPreview from "./components/document/DocumentPreview.jsx";
import SessionMenu from "./components/layout/SessionMenu.jsx";
import { useSession } from "./state/useSession.js";
import { createSessionDb } from "./storage/sessionDb.js";

// Created once so the storage keeps the same identity between renders.
const sessionStorage = createSessionDb();

export default function App() {
  const session = useSession(sessionStorage);

  // Wait for the saved session to be restored so a blank session is never
  // shown first and then replaced.
  if (!session.isLoaded) {
    return (
      <div className="app app-loading" data-area="app" role="status" aria-live="polite">
        <p className="app-loading-text">Loading your session…</p>
      </div>
    );
  }

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
          isComplete={session.isComplete}
          phase={session.phase}
          checklist={session.checklist}
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
          isComplete={session.isComplete}
          finalPrompt={session.finalPrompt}
          documentMarkdown={session.documentMarkdown}
          onSubmitDocument={session.submitDocument}
          onClearDocument={session.clearDocument}
        />
      </main>

      {session.isComplete && session.documentMarkdown.trim() !== "" && (
        <DocumentPreview
          markdown={session.documentMarkdown}
          onClear={session.clearDocument}
        />
      )}
    </div>
  );
}