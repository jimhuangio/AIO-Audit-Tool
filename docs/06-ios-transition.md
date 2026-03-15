# iOS Transition Guide — Fanout SEO

> This document outlines how to extend Fanout from a macOS desktop app to an iOS companion app. The strategy is **read-only iOS viewer** — data harvesting stays on the desktop.

---

## Why iOS? (And Why Not Full iOS)

**The case for an iOS companion:**
- SEOs present to clients from iPads in meetings
- "Show me our AI visibility score" while mobile should not require opening a laptop
- The position heatmap and topic views are naturally touchable

**Why NOT full iOS (data harvesting on iOS):**
- DataForSEO MCP server cannot run on iOS (no child_process, no stdin/stdout)
- SQLite writes during concurrent API calls need Node.js ecosystem
- Battery/performance concerns with crawling thousands of URLs
- iOS background execution limits would break long-running jobs

**Conclusion:** iOS = read-only companion. Desktop = data engine.

---

## Architecture for iOS Companion

```
Desktop App (.aio-project.db)
        │
        ├── Option A: iCloud Drive sync
        │     User moves .db file to iCloud Drive folder
        │     iOS app opens it directly via Files API
        │
        ├── Option B: Export to JSON/SQLite on demand
        │     Desktop exports snapshot → iCloud Drive
        │     iOS reads snapshot (stale but acceptable)
        │
        └── Option C: Local WiFi sync (future)
              Desktop runs local HTTP server
              iOS fetches data over LAN
              More complex, more real-time
```

**Recommended start:** Option B (JSON export snapshot) — simplest, works immediately.

---

## Step-by-Step iOS Transition

### Step 1: Design the Shared Data Contract (Week 1)

Before writing iOS code, define the JSON export format that iOS will consume.

```typescript
// Desktop exports this when user taps "Export for iOS"
interface FanoutExport {
  exportedAt: number              // Unix timestamp
  projectName: string
  stats: {
    totalKeywords: number
    keywordsWithAIO: number
    uniqueDomains: number
    topicsCount: number
  }
  // Pre-computed reports (iOS doesn't query SQLite directly)
  aioPositions: {
    root: AIOPositionRow[]        // pre-computed for root mode
    subdomain: AIOPositionRow[]   // pre-computed for subdomain mode
  }
  domainPivot: {
    root: AIODomainPivotRow[]
    subdomain: AIODomainPivotRow[]
  }
  topics: TopicWithDomains[]
  keywords: KeywordSummary[]      // top 1000 by AIO presence
}
```

Desktop generates this JSON when user clicks "Export for iOS" → saves to iCloud Drive as `{projectName}-export.json`.

### Step 2: iOS Tech Stack Decision

| Option | Pros | Cons |
|--------|------|------|
| **SwiftUI + Swift** | Native, best iOS performance, full Files API | No code sharing with desktop |
| **React Native** | Share TypeScript types with desktop | More setup, less native feel |
| **Capacitor** (web → iOS) | Share React components | Limited native file access |

**Recommendation:** SwiftUI for the companion. The UI is mostly tables and charts — straightforward SwiftUI. Share TypeScript types as JSON schema documentation only.

### Step 3: iOS Project Setup

```bash
# Prerequisites
xcode-select --install
# Open Xcode → New Project → iOS App → SwiftUI

# Project structure
FanoutCompanion/
├── Models/
│   ├── FanoutExport.swift        # Codable structs matching JSON export
│   ├── AIOPositionRow.swift
│   └── TopicRow.swift
├── Views/
│   ├── ContentView.swift          # Tab bar: Positions | Topics | Keywords
│   ├── AIOPositionsView.swift     # Main heatmap table
│   ├── DomainToggle.swift         # Root ↔ Subdomain (same UX as desktop)
│   ├── TopicListView.swift
│   └── KeywordDetailView.swift
├── Services/
│   ├── ExportLoader.swift         # Load JSON from Files/iCloud
│   └── AppState.swift             # @EnvironmentObject (domainMode)
└── FanoutCompanionApp.swift
```

### Step 4: File Access on iOS

```swift
// Services/ExportLoader.swift
import SwiftUI
import UniformTypeIdentifiers

class ExportLoader: ObservableObject {
    @Published var export: FanoutExport?
    @Published var isLoading = false

    func openFilePicker() {
        // iOS document picker for .json files
        let picker = UIDocumentPickerViewController(
            forOpeningContentTypes: [UTType.json],
            asCopy: true
        )
        picker.delegate = self
        // Present picker...
    }

    func load(from url: URL) async throws {
        isLoading = true
        defer { isLoading = false }
        let data = try Data(contentsOf: url)
        export = try JSONDecoder().decode(FanoutExport.self, from: data)
    }
}
```

### Step 5: AIO Positions View (SwiftUI)

```swift
// Views/AIOPositionsView.swift
struct AIOPositionsView: View {
    @EnvironmentObject var appState: AppState
    let export: FanoutExport

    var positions: [AIOPositionRow] {
        appState.domainMode == .root
            ? export.aioPositions.root
            : export.aioPositions.subdomain
    }

    var body: some View {
        List {
            // Group by position (1-10)
            ForEach(1...10, id: \.self) { pos in
                Section("Position \(pos)") {
                    ForEach(positions.filter { $0.position == pos }.prefix(10)) { row in
                        AIOPositionRow(row: row)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("AIO Sources")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                DomainModeToggle()
            }
        }
    }
}
```

### Step 6: iCloud Drive Sync Strategy

```
Desktop:
  Project → Export for iOS → saves to:
  ~/Library/Mobile Documents/com~apple~CloudDocs/Fanout/projectName-export.json

iOS:
  Files app → iCloud Drive → Fanout folder → projectName-export.json
  Or: App uses UIDocumentPickerViewController to open directly
```

**Stale data handling:** Show `exportedAt` timestamp prominently in iOS app ("Data from 3 hours ago"). No live sync needed for v1.

### Step 7: Platform-Specific Considerations

| Consideration | Desktop Approach | iOS Approach |
|---------------|-----------------|--------------|
| Domain toggle | Zustand (in-memory) | `@EnvironmentObject AppState` |
| Table rendering | TanStack Table (virtual scroll) | SwiftUI `List` (native virtual scroll) |
| Charts | Recharts | Swift Charts (iOS 16+) |
| File access | Node.js fs | UIDocumentPickerViewController |
| State persistence | Never (session-only for toggle) | Never (session-only for toggle) |
| Data source | SQLite via IPC | Pre-computed JSON export |

### Step 8: App Store Considerations

- **Privacy:** No internet access needed (reads local JSON only) → strong privacy story
- **Entitlements needed:** `com.apple.security.files.user-selected.read-only` (Files access)
- **iCloud entitlement:** `com.apple.developer.ubiquity-container-identifiers` (if syncing via iCloud)
- **TestFlight first:** Distribute to client contacts via TestFlight before App Store
- **Pricing:** Companion is free; value is in desktop app

### Step 9: Long-Term iOS Roadmap

| Phase | Feature |
|-------|---------|
| iOS v1 | Read-only JSON export viewer, domain toggle |
| iOS v2 | Direct SQLite read (copy DB to app sandbox) |
| iOS v3 | iCloud Drive auto-sync of project file |
| iOS v4 | Share sheet: export specific views as images for presentations |
| iOS Future | Watch app: "Your AI visibility score: 847 (+12 this week)" |

---

## What NOT to Port to iOS

- **Run/harvest controls** — MCP server can't run on iOS
- **Crawler** — background fetch limitations make this impractical
- **CSV export via file system** — use iOS Share Sheet instead
- **Project create/edit** — keep management on desktop

---

*← [Idea Inbox](./05-idea-inbox.md) | Next: [Debugging & Planning Guide](./07-debugging-planning.md) →*
