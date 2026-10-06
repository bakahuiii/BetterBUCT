import { bridge, isDesktop, isMobile } from "./bridge";
import { useEffect, useState } from "react";
import theiaMark from "./assets/theia-mark.png";
import { useTheiaApp } from "./hooks/useTheiaApp";
import { useGithubUpdateStatus } from "./hooks/useGithubUpdateStatus";
import { useAppearance } from "./hooks/useAppearance";
import { TitleBar } from "./layout/TitleBar";
import { AppSidebar } from "./layout/AppSidebar";
import { WorkspaceChrome } from "./layout/WorkspaceChrome";
import { viewTitles } from "./ui/navigation";
import { DashboardView } from "./views/DashboardView";
import { ScheduleView } from "./views/ScheduleView";
import { ExamsView } from "./views/ExamsView";
import { GradesView } from "./views/GradesView";
import { AcademicProgressView } from "./views/AcademicProgressView";
import { CoursesView } from "./views/CoursesView";
import { CourseSelectionView } from "./views/CourseSelectionView";
import { AssignmentsView } from "./views/AssignmentsView";
import { MobileAssignmentsView } from "./views/MobileAssignmentsView";
import { SettingsView, type SettingsSection } from "./views/SettingsView";
import { ToolsView } from "./views/ToolsView";
import { CommunicationsView } from "./views/CommunicationsView";
import { AdvisorView } from "./views/AdvisorView";
import { CredentialSetupModal } from "./views/settings/Credentials";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { TooltipProvider } from "./components/ui/tooltip";

export default function App() {
  const app = useTheiaApp();
  // The shell is the single owner of the startup update check. Settings views
  // subscribe to the same bridge state instead of issuing another request.
  const updateStatus = useGithubUpdateStatus(app.state?.appVersion || "web", { autoCheck: isMobile });
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("appearance");
  useAppearance(); // apply stored dark/light mode on mount
  // Notification settings now live inside the Tools surface. Migrate older
  // persisted/mobile sessions without leaving a dead route behind.
  useEffect(() => {
    if (app.view === "notifications") app.setView("tools");
  }, [app.view, app.setView]);
  useEffect(() => {
    if (!isMobile) return;
    const frame = window.requestAnimationFrame(() => {
      const workspace = document.querySelector<HTMLElement>(".workspace");
      workspace?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      const settings = document.querySelector<HTMLElement>(".settings-page-shell");
      settings?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [app.view, app.settingsOpen]);
  const mobileUnsupportedViews = new Set(["advisor", "selection", "mailbox"]);
  if (!app.state)
    return (
      <TooltipProvider>
      <main className="loading-screen">
        <div className="brand-mark">
          <img src={theiaMark} alt="BetterBUCT" />
        </div>
        <strong className="loading-wordmark">BetterBUCT</strong>
        <span
          role={app.startupError ? "alert" : "status"}
          aria-live={app.startupError ? "assertive" : "polite"}
        >
          {app.startupError || app.syncProgress || "正在读取本地校园数据"}
        </span>
      </main>
      </TooltipProvider>
    );

  const state = app.state;
  const goTo = (view: typeof app.view) => {
    if (isMobile && mobileUnsupportedViews.has(view)) {
      app.setMessage("此功能暂未在安卓版实现。", "info");
      return;
    }
    app.setView(view);
    app.setSettingsOpen(false);
    app.setSidebarOpen(false);
  };
  const goToFromPalette = (view: typeof app.view) => {
    goTo(view);
    app.setPaletteOpen(false);
    app.setPaletteQuery("");
  };
  const academicApiEnabled = state.settings.academicApiEnabled === true;
  const academicApiConfigured = Boolean(academicApiEnabled && app.academicApiCredentialStatus?.saved);
  const theolExpected = app.credentials.saved || app.auth.theol.connected;
  const allSourcesConnected =
    app.auth.jwglxt.connected && (!theolExpected || app.auth.theol.connected);

  return (
    <TooltipProvider>
    <div
      className={`app-shell view-${app.view}${app.sidebarCollapsed ? " sidebar-is-collapsed" : ""}${isMobile && app.settingsOpen ? " settings-open" : ""}`}
    >
      <TitleBar />
      <div className="app-body">
      <AppSidebar
        state={state}
        apiBase={app.apiBase}
        syncing={app.syncing}
        syncFreshness={app.syncFreshness}
        view={app.view}
        settingsOpen={app.settingsOpen}
        open={app.sidebarOpen}
        collapsed={app.sidebarCollapsed}
        mark={theiaMark}
        onNavigate={goTo}
        onClose={() => app.setSidebarOpen(false)}
        onToggleCollapsed={() => app.setSidebarCollapsed(!app.sidebarCollapsed)}
        onOpenSettings={() => {
          setSettingsSection(isMobile ? "data" : "appearance");
          app.setSettingsOpen(true);
        }}
      />
      <WorkspaceChrome
        state={state}
        view={app.view}
        title={isMobile && app.view === "notices"
          ? { title: "通知", subtitle: "教务系统与北化在线THEOL动态" }
          : viewTitles[app.view]}
        auth={app.auth}
        syncing={app.syncing}
        syncPercent={app.syncPercent}
        syncProgress={app.syncProgress}
        hasSession={app.hasSession}
        allSourcesConnected={allSourcesConnected}
        credentialsSaved={app.credentials.saved}
        academicApiEnabled={academicApiEnabled}
        academicApiConfigured={academicApiConfigured}
        query={app.query}
        message={app.message}
        messageKind={app.messageKind}
        syncFailure={app.syncFailure}
        syncFreshness={app.syncFreshness}
        updateStatus={updateStatus}
        paletteOpen={app.paletteOpen}
        paletteQuery={app.paletteQuery}
        paletteItems={app.paletteItems}
        onOpenSidebar={() => app.setSidebarOpen(true)}
        onOpenAppearanceSettings={() => {
          setSettingsSection("appearance");
          app.setSettingsOpen(true);
        }}
        onQueryChange={app.setQuery}
        onSync={() => void app.sync()}
        onRequestLogin={() => { void app.requestLogin({ interactive: true }).catch(() => undefined); }}
        onDismissMessage={() => app.setMessage(null)}
        onDismissSyncFailure={app.dismissSyncFailure}
        onPaletteQueryChange={app.setPaletteQuery}
        onClosePalette={() => app.setPaletteOpen(false)}
        onNavigate={goToFromPalette}
      >
        <ErrorBoundary key={app.view}>
        {app.view === "dashboard" && (
          <DashboardView
            state={state}
            onNavigate={app.setView}
            onOpenSource={(assignmentId) =>
              void app.openAssignmentSource(assignmentId)
            }
            advisorItem={app.visibleAdvisorActions[0] || null}
            advisorLoading={app.advisorLoading}
            advisorError={app.advisorError}
          />
        )}
        {!isMobile && app.view === "advisor" && (
          <AdvisorView
            overview={app.advisorOverview}
            actions={app.visibleAdvisorActions}
            modelStatus={app.modelStatus}
            loading={app.advisorLoading}
            error={app.advisorError}
            pendingActionId={app.advisorActionPendingId}
            onRetry={() => void app.refreshAdvisorOverview()}
            onAction={(item) => void app.executeAdvisorAction(item)}
            onSnooze={app.snoozeAdvisorItem}
            onDismiss={app.dismissAdvisorItem}
            onOpenSettings={() => {
              setSettingsSection("model");
              app.setSettingsOpen(true);
            }}
          />
        )}
        {app.view === "schedule" && (
          <ScheduleView
            items={state.schedule}
            terms={app.visibleTerms}
            calendar={state.dataCatalog.collections.academicCalendar.calendar}
            onExportPdf={() => void app.exportSchedulePdf()}
            onOpenPdfDirectory={() => void app.openScheduleDirectory()}
            exportingPdf={app.exportingSchedulePdf}
          />
        )}
        {app.view === "exams" && (
          <ExamsView state={state} terms={app.visibleTerms} />
        )}
        {app.view === "grades" && (
          <GradesView
            grades={state.grades}
            progress={state.academicProgress}
            gpa={state.profile?.gpa}
            terms={app.visibleTerms}
            gradeDetails={state.academicExtras?.domains?.["grade-details"]}
            gradeDetailsRefreshing={app.academicDomainRefreshing === "grade-details"}
            onRefreshGradeDetails={() => void app.refreshAcademicDomain("grade-details")}
          />
        )}
        {app.view === "progress" && (
          <AcademicProgressView
            progress={state.academicProgress}
            grades={state.grades}
            selectedCourses={state.selectedCourses}
            terms={app.visibleTerms}
          />
        )}
        {app.view === "courses" && (
          <CoursesView
            courses={state.courses}
            state={state}
            query={app.query}
            onQueryChange={app.setQuery}
            terms={app.visibleTerms}
            onOpenMaterial={(courseId, materialId) => app.openCourseMaterial(courseId, materialId)}
            onRefreshMaterials={() => void app.refreshAcademicDomain("theol-course-details", "课程资料已更新。")}
            refreshingMaterials={app.academicDomainRefreshing === "theol-course-details"}
          />
        )}
        {!isMobile && app.view === "selection" && (
          <CourseSelectionView
            portal={app.courseSelectionPortal}
            candidates={app.courseSelectionCandidates}
            candidateCatalogPage={app.courseSelectionCatalogPage}
            advisorSnapshotRevision={app.advisorOverview?.snapshotRevision || null}
            snapshot={app.courseSelection}
            loading={app.courseSelectionLoading}
            schoolSchedule={app.schoolSchedule}
            schoolScheduleLoading={app.schoolScheduleLoading}
            schoolScheduleError={app.schoolScheduleError}
            schoolScheduleRefreshFailed={app.schoolScheduleRefreshFailed}
            terms={app.visibleTerms}
            academicCalendarAnalysis={state.dataCatalog.collections.academicCalendar.analysis}
            onDiscover={() => void app.discoverCourseSelection()}
            onLoadCandidates={(blockId, target, options) =>
              void app.loadCourseSelectionCandidates(blockId, target, options)
            }
            onSearchSchoolSchedule={(query) => void app.searchSchoolSchedule(query)}
            onDismissSchoolScheduleError={app.dismissSchoolScheduleError}
            onSaveSchoolTarget={(target) => void app.saveCourseSelectionTarget(target)}
            onRemoveSchoolTarget={(id) => void app.removeCourseSelectionTarget(id)}
            onSetSentinel={(config) => void app.setCourseSelectionSentinel(config)}
            onStart={(options) => void app.startCourseSelection(options)}
            onStop={() => void app.stopCourseSelection()}
          />
        )}
        {isMobile && app.view === "assignments" && (
          <MobileAssignmentsView
            items={state.assignments}
            refreshing={app.academicDomainRefreshing === "assignments"}
            onRefresh={() => void app.refreshAcademicDomain("assignments", "作业列表已更新。")}
          />
        )}
        {!isMobile && app.view === "assignments" && (
          <AssignmentsView
            items={state.assignments}
            workspaces={state.workspaces}
            workingId={app.workingAssignmentId}
            onPrepare={app.prepareCourseWork}
            onOpenWorkspace={(assignmentId) =>
              void app.openCourseWork(assignmentId)
            }
            onImportAnswerKey={(assignmentId) =>
              void app.importCourseWorkFile(assignmentId, "answer-key")
            }
            onApplyTestAnswers={(assignmentId) =>
              void app.applyTestAnswers(assignmentId)
            }
            onOpenSubmission={(assignmentId) =>
              void app.openSubmission(assignmentId)
            }
            onOpenSource={(assignmentId) =>
              void app.openAssignmentSource(assignmentId)
            }
            onProcessWithModel={app.processCourseWorkWithModel}
            onGenerateNotes={app.generateNotes}
            onGeneratePaper={app.generatePaper}
            onRenderPdf={app.renderMdFile}
            onOpenPdf={app.openAnswerPdf}
            modelConfigured={app.modelStatus.configured}
          />
        )}
        {app.view === "notices" && (
          <CommunicationsView state={state} />
        )}
        {app.view === "tools" && (
          <ToolsView
            state={state}
            dataCatalog={state.dataCatalog}
            apiBase={app.apiBase}
            terms={app.visibleTerms}
            calendarAssetUrls={app.calendarAssetUrls}
            academicPlanAssetBaseUrl={app.academicPlanAssetBaseUrl}
            refreshingDomain={app.academicDomainRefreshing}
            onRefreshDomain={(domain) => void app.refreshAcademicDomain(domain)}
            onOpenSource={(url) => void bridge.openSource(url)}
            onOpenAttachment={(domain, attachmentId) => bridge.openAcademicAttachment(domain, attachmentId)}
          />
        )}
        </ErrorBoundary>
      </WorkspaceChrome>
      </div>
      <SettingsView
        open={app.settingsOpen}
        onOpenChange={app.setSettingsOpen}
        initialSection={settingsSection}
        state={state}
        apiBase={app.apiBase}
        apiStatus={app.apiStatus}
        auth={app.auth}
        credentials={app.credentials}
        academicApiCredentials={
          app.academicApiCredentialStatus || {
            saved: false,
            encryptionAvailable: false,
            enabled: false,
          }
        }
        mailCredentials={
          app.mailCredentialStatus || {
            saved: false,
            encryptionAvailable: false,
          }
        }
        modelStatus={app.modelStatus}
        syncing={app.syncing}
        syncProgress={app.syncProgress}
        onSync={() => void app.sync()}
        activityLog={app.activityLog}
        activityLoading={app.activityLoading}
        onRefreshActivity={() => void app.refreshActivityLog()}
        onAuthChange={app.setAuth}
        onCredentialChange={app.setCredentialStatus}
        onAcademicApiCredentialChange={app.setAcademicApiCredentialStatus}
        onMailCredentialChange={app.setMailCredentialStatus}
        onModelStatus={app.setModelStatus}
        onMessage={app.setMessage}
      />
      {isDesktop &&
        app.credentialStatus &&
        !app.credentialStatus.saved &&
        !app.credentialDismissed && (
          <CredentialSetupModal
            status={app.credentialStatus}
            onStatus={app.setCredentialStatus}
            onClose={() => app.setCredentialDismissed(true)}
            onMessage={app.setMessage}
          />
        )}
    </div>
    </TooltipProvider>
  );
}
