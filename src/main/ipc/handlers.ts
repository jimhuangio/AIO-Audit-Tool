import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import {
  openProject,
  createProject,
  closeProject,
  updateProjectSettings,
  getProjectMeta,
  getProjectStats,
  getDB,
  insertRootKeywords,
  getKeywordRows,
  getKeywordsForDomain,
  getDomainPositions,
  getDomainSuggestions,
  getJobCounts,
  getAIOPositionReport,
  getAIODomainPivot,
  getContentSourceReport,
  getAIOSourcesForKeyword,
  getPAAQuestionsForKeyword,
  getChildKeywordsFor,
  getSerpResultRaw,
  getCrawlStats,
  getCrawledPageRows,
  getSnippetMatchesForKeyword,
  getClusterableKeywords,
  clearTopics,
  clearProjectData,
  insertTopics,
  getTopics,
  getTopicKeywords,
  updateTopicLabel,
  getTopicAIOSnippets,
} from '../db'
import { runClustering } from '../topics/run'
import { testGeminiKey, generateContentBrief } from '../gemini/client'
import { buildReportHTML } from '../report/builder'
import { crawlScheduler } from '../crawler/scheduler'
import { mcpClient, DataForSEOClient } from '../mcp/client'
import { scheduler } from '../fanout/scheduler'
import { readAllCredentials, saveServiceCredentials, removeServiceCredentials } from '../credentials'
import type { RunConfig } from '../../types'

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  // ─── Project ───────────────────────────────────────────────────────────────

  ipcMain.handle('project:create', async () => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Create New Project',
      defaultPath: 'New Project.aio-project.db',
      filters: [{ name: 'Fanout Project', extensions: ['aio-project.db'] }]
    })
    if (!filePath) return null
    // Derive project name from the chosen filename
    const basename = filePath.split(/[\\/]/).pop() ?? 'Project'
    const name = basename.replace(/\.aio-project\.db$/i, '').replace(/\.db$/i, '').trim() || 'Project'
    return createProject(filePath, name)
  })

  ipcMain.handle('project:open', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Open Project',
      filters: [{ name: 'Fanout Project', extensions: ['aio-project.db', 'db'] }],
      properties: ['openFile']
    })
    if (!filePaths[0]) return null
    const meta = openProject(filePaths[0])
    const win = getWindow()
    if (win) scheduler.setWindow(win)
    return meta
  })

  ipcMain.handle('project:close', () => {
    scheduler.stop()
    crawlScheduler.stop()
    mcpClient.disconnect()
    closeProject()
  })

  ipcMain.handle('project:getMeta', () => getProjectMeta())
  ipcMain.handle('project:getStats', () => getProjectStats())

  ipcMain.handle('project:updateSettings', (_e, settings) => {
    updateProjectSettings(settings)
    return getProjectMeta()
  })

  ipcMain.handle('project:clearData', () => {
    crawlScheduler.stop()
    clearProjectData()
  })

  // ─── MCP Connection ────────────────────────────────────────────────────────

  // Test a specific API key without needing a project open
  ipcMain.handle('mcp:testKey', async (_e, apiKey: string) => {
    const client = new DataForSEOClient()
    client.connect(apiKey)
    await client.testConnection()
    return { ok: true }
  })

  ipcMain.handle('mcp:connect', async () => {
    const globalDfs = readAllCredentials()['dataforseo'] ?? {}
    // Try project settings first, then global store
    let apiKey = globalDfs.apiKey
      || (globalDfs.login && globalDfs.password ? btoa(`${globalDfs.login}:${globalDfs.password}`) : '')
    try {
      const meta = getProjectMeta()
      apiKey = meta.dfsApiKey || apiKey
    } catch { /* no project open — use global key */ }
    if (!apiKey) {
      throw new Error('DataForSEO API key not configured — add it in Setup → API Credentials')
    }
    mcpClient.connect(apiKey)
    await mcpClient.testConnection()
    return { connected: true }
  })

  ipcMain.handle('mcp:disconnect', () => {
    mcpClient.disconnect()
  })

  ipcMain.handle('mcp:isConnected', () => ({ connected: mcpClient.isConnected() }))

  // ─── Keywords ─────────────────────────────────────────────────────────────

  ipcMain.handle('keywords:insert', (_e, rawText: string) => {
    const lines = rawText
      .split(/[\n,]/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    const count = insertRootKeywords(lines)
    return { inserted: count, total: lines.length }
  })

  ipcMain.handle('keywords:getRows', (_e, limit = 500, offset = 0) => {
    return getKeywordRows(limit, offset)
  })

  ipcMain.handle('keywords:getForDomain', (_e, domain: string) => {
    return getKeywordsForDomain(domain)
  })

  ipcMain.handle('keywords:getDomainPositions', (_e, domain: string) => {
    return getDomainPositions(domain)
  })

  ipcMain.handle('keywords:domainSuggestions', (_e, partial: string) => {
    return getDomainSuggestions(partial)
  })

  ipcMain.handle('keywords:getJobCounts', () => getJobCounts())


  // ─── Run control ──────────────────────────────────────────────────────────

  ipcMain.handle('run:start', async (_e, config: Partial<RunConfig> = {}) => {
    if (!mcpClient.isConnected()) {
      const meta = getProjectMeta()
      const globalDfs = readAllCredentials()['dataforseo'] ?? {}
      const apiKey = meta.dfsApiKey
        || globalDfs.apiKey
        || (globalDfs.login && globalDfs.password ? btoa(`${globalDfs.login}:${globalDfs.password}`) : '')
      if (!apiKey) throw new Error('DataForSEO API key not configured')
      mcpClient.connect(apiKey)
    }
    const win = getWindow()
    if (win) scheduler.setWindow(win)
    await scheduler.start()
    return { started: true }
  })

  ipcMain.handle('run:pause', () => {
    scheduler.pause()
    return { paused: true }
  })

  ipcMain.handle('run:resume', async () => {
    scheduler.resume()
    return { resumed: true }
  })

  ipcMain.handle('run:stop', () => {
    scheduler.stop()
    return { stopped: true }
  })

  // ─── Reports ──────────────────────────────────────────────────────────────

  ipcMain.handle('report:aioPositions', (_e, useSubdomain: boolean) => {
    return getAIOPositionReport(useSubdomain)
  })

  ipcMain.handle('report:aioDomainPivot', (_e, useSubdomain: boolean) => {
    return getAIODomainPivot(useSubdomain)
  })

  ipcMain.handle('report:contentSources', (_e, useSubdomain: boolean) => {
    return getContentSourceReport(useSubdomain)
  })

  // ─── Keyword detail ───────────────────────────────────────────────────────

  ipcMain.handle('keyword:aioSources', (_e, keywordId: number) => {
    return getAIOSourcesForKeyword(keywordId)
  })

  ipcMain.handle('keyword:paaQuestions', (_e, keywordId: number) => {
    return getPAAQuestionsForKeyword(keywordId)
  })

  ipcMain.handle('keyword:children', (_e, keywordId: number) => {
    return getChildKeywordsFor(keywordId)
  })

  ipcMain.handle('keyword:rawJson', (_e, keywordId: number, resultType: string) => {
    return getSerpResultRaw(keywordId, resultType)
  })

  // ─── CSV upload ───────────────────────────────────────────────────────────

  ipcMain.handle('keywords:uploadCSV', async () => {
    const { filePaths } = await dialog.showOpenDialog({
      title: 'Import Keywords CSV',
      filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }],
      properties: ['openFile']
    })
    if (!filePaths[0]) return null

    const { readFileSync } = await import('fs')
    const raw = readFileSync(filePaths[0], 'utf-8').replace(/^\uFEFF/, '') // strip BOM
    const lines = raw.split(/\r?\n/)

    // Detect keyword column: first column of first data row, or column named 'keyword'
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''))
    const kwColIdx = header.indexOf('keyword') !== -1 ? header.indexOf('keyword') : 0
    const hasHeader = isNaN(Number(header[0])) && header[0].length > 0

    const keywords = lines
      .slice(hasHeader ? 1 : 0)
      .map((line) => {
        const cols = line.split(',')
        return cols[kwColIdx]?.trim().replace(/^"|"$/g, '') ?? ''
      })
      .filter((kw) => kw.length > 0)

    const count = insertRootKeywords(keywords)
    return { inserted: count, total: keywords.length }
  })

  // ─── Export ───────────────────────────────────────────────────────────────

  ipcMain.handle('export:csv', async (_e, table: string, useSubdomain: boolean) => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Export CSV',
      defaultPath: `fanout-${table}-${Date.now()}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (!filePath) return null

    let rows: unknown[] = []
    if (table === 'aio-positions') rows = getAIOPositionReport(useSubdomain)
    if (table === 'aio-pivot') rows = getAIODomainPivot(useSubdomain)

    if (rows.length === 0) return null

    const headers = Object.keys(rows[0] as object).join(',')
    const body = rows.map((r) => Object.values(r as object).join(',')).join('\n')
    writeFileSync(filePath, `${headers}\n${body}`, 'utf-8')
    return filePath
  })

  ipcMain.handle('export:projectCopy', async () => {
    const { filePath } = await dialog.showSaveDialog({
      title: 'Save Project Copy',
      defaultPath: `fanout-backup-${Date.now()}.aio-project.db`,
      filters: [{ name: 'Fanout Project', extensions: ['aio-project.db'] }]
    })
    if (!filePath) return null
    // Use better-sqlite3's built-in backup API for safe hot copy
    const db = getDB()
    await (db as any).backup(filePath)
    return filePath
  })

  // ─── Crawler ──────────────────────────────────────────────────────────────

  ipcMain.handle('crawl:start', async () => {
    const win = getWindow()
    if (win) crawlScheduler.setWindow(win)
    await crawlScheduler.start()
    return { started: true }
  })

  ipcMain.handle('crawl:pause', () => {
    crawlScheduler.pause()
    return { paused: true }
  })

  ipcMain.handle('crawl:resume', () => {
    crawlScheduler.resume()
    return { resumed: true }
  })

  ipcMain.handle('crawl:stop', () => {
    crawlScheduler.stop()
    return { stopped: true }
  })

  ipcMain.handle('crawl:getStats', () => getCrawlStats())

  ipcMain.handle('crawl:getPages', (_e, limit = 500, offset = 0) => {
    return getCrawledPageRows(limit, offset)
  })

  ipcMain.handle('crawl:snippetMatches', (_e, keywordId: number) => {
    return getSnippetMatchesForKeyword(keywordId)
  })

  // ─── Topics ───────────────────────────────────────────────────────────────

  ipcMain.handle('topics:run', async () => {
    const inputs = getClusterableKeywords()
    const clusters = await runClustering(inputs)
    clearTopics()
    insertTopics(clusters)
    return { count: clusters.length }
  })

  ipcMain.handle('gemini:testKey', async (_e, apiKey: string) => {
    await testGeminiKey(apiKey)
    return { ok: true }
  })

  ipcMain.handle('topics:getAll', () => getTopics())

  ipcMain.handle('topics:getKeywords', (_e, topicId: number) => getTopicKeywords(topicId))

  ipcMain.handle('topics:updateLabel', (_e, topicId: number, label: string) => {
    updateTopicLabel(topicId, label)
  })

  // ─── Content Brief ────────────────────────────────────────────────────────

  ipcMain.handle('topics:generateBrief', async (_e, topicId: number) => {
    const creds = readAllCredentials()
    const apiKey = creds['gemini']?.apiKey ?? ''
    if (!apiKey) throw new Error('Gemini API key not configured — add it in Setup → API Credentials')

    const topics   = getTopics()
    const topic    = topics.find(t => t.id === topicId)
    if (!topic) throw new Error('Topic not found')

    const keywords  = getTopicKeywords(topicId)
    const snippets  = getTopicAIOSnippets(topicId)
    return generateContentBrief(topic.label, keywords, snippets, topic.topDomain ?? null, apiKey)
  })

  // ─── Report ───────────────────────────────────────────────────────────────

  ipcMain.handle('report:generate', async () => {
    const meta   = getProjectMeta()
    const stats  = getProjectStats()
    const pivot  = getAIODomainPivot(false)
    const topics = getTopics()

    const topicData = topics.map(topic => ({
      topic,
      keywords: getTopicKeywords(topic.id)
    }))

    const html = buildReportHTML({ meta, stats, pivot, topics: topicData, generatedAt: Date.now() })

    // Write to a temp file and open in the default browser
    const tmpDir = mkdtempSync(join(tmpdir(), 'fanout-report-'))
    const filePath = join(tmpDir, `${meta.name.replace(/[^a-z0-9]/gi, '_')}_AIO_Report.html`)
    writeFileSync(filePath, html, 'utf8')
    await shell.openPath(filePath)
    return { filePath }
  })

  // ─── Global API Credentials ───────────────────────────────────────────────

  ipcMain.handle('credentials:getAll', () => readAllCredentials())

  ipcMain.handle('credentials:save', (_e, service: string, fields: Record<string, string>) => {
    saveServiceCredentials(service, fields)
  })

  ipcMain.handle('credentials:remove', (_e, service: string) => {
    removeServiceCredentials(service)
  })
}
