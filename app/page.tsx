'use client'

import { useState, useEffect, useRef } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import {
  getSchedule,
  getScheduleLogs,
  pauseSchedule,
  resumeSchedule,
  triggerScheduleNow,
  cronToHuman,
  type ExecutionLog,
  type Schedule
} from '@/lib/scheduler'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Loader2, Settings, TrendingUp, TrendingDown, Play, RefreshCw, Clock, Mail, Activity } from 'lucide-react'

// Constants
const AGENT_ID = '698e0acc3e19f69d1aa0c41d'
const SCHEDULE_ID = '698e0ad2ebe6fd87d1dcc1ae'

// Theme variables
const THEME_VARS = {
  '--background': '220 25% 7%',
  '--foreground': '220 15% 85%',
  '--card': '220 22% 10%',
  '--primary': '220 80% 55%',
  '--accent': '160 70% 45%',
  '--destructive': '0 75% 55%',
  '--border': '220 18% 18%',
  '--muted': '220 15% 20%',
} as React.CSSProperties

// Types
interface StockAlertData {
  stock_symbol?: string
  current_price?: number
  daily_change_amount?: number
  daily_change_percentage?: number
  timestamp?: string
  market_status?: string
  email_sent?: boolean
  recipient_email?: string
}

interface AlertHistoryItem {
  id: string
  executed_at: string
  success: boolean
  data: StockAlertData | null
  error_message?: string
}

// Helper function to parse execution log response
function parseExecutionData(log: ExecutionLog): StockAlertData | null {
  try {
    if (!log.response_output) return null
    const parsed = JSON.parse(log.response_output)
    const result = parsed?.result
    if (!result) return null
    return {
      stock_symbol: result.stock_symbol,
      current_price: result.current_price,
      daily_change_amount: result.daily_change_amount,
      daily_change_percentage: result.daily_change_percentage,
      timestamp: result.timestamp,
      market_status: result.market_status,
      email_sent: result.email_sent,
      recipient_email: result.recipient_email,
    }
  } catch {
    return null
  }
}

// Helper function to format currency
function formatCurrency(value: number | undefined): string {
  if (value === undefined || value === null) return '$---.--'
  return `$${value.toFixed(2)}`
}

// Helper function to format percentage
function formatPercentage(value: number | undefined): string {
  if (value === undefined || value === null) return '--.--'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

// Helper function to format timestamp
function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return 'Never'
  try {
    const date = new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return timestamp
  }
}

// Helper function to calculate next run countdown
function useCountdown(nextRunTime: string | null | undefined) {
  const [countdown, setCountdown] = useState<string>('Calculating...')

  useEffect(() => {
    if (!nextRunTime) {
      setCountdown('Not scheduled')
      return
    }

    const updateCountdown = () => {
      try {
        const now = new Date().getTime()
        const target = new Date(nextRunTime).getTime()
        const diff = target - now

        if (diff <= 0) {
          setCountdown('Running soon...')
          return
        }

        const minutes = Math.floor(diff / 60000)
        const seconds = Math.floor((diff % 60000) / 1000)

        if (minutes > 60) {
          const hours = Math.floor(minutes / 60)
          const remainingMinutes = minutes % 60
          setCountdown(`${hours}h ${remainingMinutes}m`)
        } else if (minutes > 0) {
          setCountdown(`${minutes}m ${seconds}s`)
        } else {
          setCountdown(`${seconds}s`)
        }
      } catch {
        setCountdown('Invalid time')
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [nextRunTime])

  return countdown
}

export default function Home() {
  // State
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [alertHistory, setAlertHistory] = useState<AlertHistoryItem[]>([])
  const [latestAlert, setLatestAlert] = useState<StockAlertData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [sampleMode, setSampleMode] = useState(false)

  const countdown = useCountdown(schedule?.next_run_time)
  const pollIntervalRef = useRef<NodeJS.Timeout>()

  // Fetch schedule data
  const fetchSchedule = async () => {
    const result = await getSchedule(SCHEDULE_ID)
    if (result.success && result.schedule) {
      setSchedule(result.schedule)
    } else {
      setError(result.error ?? 'Failed to load schedule')
    }
    setLoadingSchedule(false)
  }

  // Fetch alert history
  const fetchHistory = async () => {
    const result = await getScheduleLogs(SCHEDULE_ID, { limit: 50 })
    if (result.success) {
      const history = (result.executions ?? []).map(log => ({
        id: log.id,
        executed_at: log.executed_at,
        success: log.success,
        data: parseExecutionData(log),
        error_message: log.error_message ?? undefined,
      }))
      setAlertHistory(history)

      // Set latest alert from first successful execution
      const latest = history.find(h => h.success && h.data)
      if (latest?.data) {
        setLatestAlert(latest.data)
      }
    }
    setLoadingHistory(false)
  }

  // Toggle schedule active state
  const toggleSchedule = async () => {
    if (!schedule) return
    setLoading(true)
    setError(null)

    const result = schedule.is_active
      ? await pauseSchedule(SCHEDULE_ID)
      : await resumeSchedule(SCHEDULE_ID)

    if (result.success) {
      await fetchSchedule()
    } else {
      setError(result.error ?? 'Failed to toggle schedule')
    }
    setLoading(false)
  }

  // Manual trigger
  const triggerManually = async () => {
    setLoading(true)
    setError(null)

    const result = await triggerScheduleNow(SCHEDULE_ID)
    if (result.success) {
      // Wait a moment then refresh data
      setTimeout(() => {
        fetchHistory()
        fetchSchedule()
      }, 2000)
    } else {
      setError(result.error ?? 'Failed to trigger alert')
    }
    setLoading(false)
  }

  // Save email settings
  const saveSettings = () => {
    if (!recipientEmail || !recipientEmail.includes('@')) {
      setError('Please enter a valid email address')
      return
    }
    localStorage.setItem('tesla_alert_email', recipientEmail)
    setSettingsOpen(false)
    setError(null)
  }

  // Initial data load
  useEffect(() => {
    fetchSchedule()
    fetchHistory()

    // Load saved email
    const savedEmail = localStorage.getItem('tesla_alert_email')
    if (savedEmail) {
      setRecipientEmail(savedEmail)
    }

    // Poll for updates every 30 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchSchedule()
      fetchHistory()
    }, 30000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  // Sample data
  const sampleAlerts: AlertHistoryItem[] = [
    {
      id: '1',
      executed_at: new Date(Date.now() - 10 * 60000).toISOString(),
      success: true,
      data: {
        stock_symbol: 'TSLA',
        current_price: 242.84,
        daily_change_amount: 5.23,
        daily_change_percentage: 2.2,
        timestamp: new Date(Date.now() - 10 * 60000).toISOString(),
        market_status: 'Open',
        email_sent: true,
        recipient_email: 'user@example.com',
      },
    },
    {
      id: '2',
      executed_at: new Date(Date.now() - 20 * 60000).toISOString(),
      success: true,
      data: {
        stock_symbol: 'TSLA',
        current_price: 240.12,
        daily_change_amount: 2.51,
        daily_change_percentage: 1.06,
        timestamp: new Date(Date.now() - 20 * 60000).toISOString(),
        market_status: 'Open',
        email_sent: true,
        recipient_email: 'user@example.com',
      },
    },
    {
      id: '3',
      executed_at: new Date(Date.now() - 30 * 60000).toISOString(),
      success: true,
      data: {
        stock_symbol: 'TSLA',
        current_price: 238.76,
        daily_change_amount: 1.15,
        daily_change_percentage: 0.48,
        timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
        market_status: 'Open',
        email_sent: true,
        recipient_email: 'user@example.com',
      },
    },
    {
      id: '4',
      executed_at: new Date(Date.now() - 40 * 60000).toISOString(),
      success: true,
      data: {
        stock_symbol: 'TSLA',
        current_price: 237.61,
        daily_change_amount: -0.89,
        daily_change_percentage: -0.37,
        timestamp: new Date(Date.now() - 40 * 60000).toISOString(),
        market_status: 'Open',
        email_sent: true,
        recipient_email: 'user@example.com',
      },
    },
    {
      id: '5',
      executed_at: new Date(Date.now() - 50 * 60000).toISOString(),
      success: true,
      data: {
        stock_symbol: 'TSLA',
        current_price: 238.50,
        daily_change_amount: -2.34,
        daily_change_percentage: -0.97,
        timestamp: new Date(Date.now() - 50 * 60000).toISOString(),
        market_status: 'Open',
        email_sent: true,
        recipient_email: 'user@example.com',
      },
    },
  ]

  const displayHistory = sampleMode ? sampleAlerts : alertHistory
  const displayLatest = sampleMode
    ? sampleAlerts[0].data
    : latestAlert

  return (
    <div style={THEME_VARS} className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-6 h-6 text-primary" />
              <h1 className="text-xl font-semibold">Tesla Stock Price Alert</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="sample-mode" className="text-sm text-muted-foreground cursor-pointer">
                  Sample Data
                </Label>
                <Switch
                  id="sample-mode"
                  checked={sampleMode}
                  onCheckedChange={setSampleMode}
                />
              </div>
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Settings className="w-5 h-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle>Alert Settings</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="your.email@example.com"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        className="bg-background border-border"
                      />
                      <p className="text-xs text-muted-foreground">
                        You'll receive Tesla stock price alerts at this email address every 10 minutes.
                      </p>
                    </div>
                    {error && (
                      <div className="text-sm text-destructive">{error}</div>
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setSettingsOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={saveSettings} className="bg-primary text-white hover:bg-primary/90">
                        Save Settings
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Control Panel */}
          <div className="space-y-6">
            {/* Status Card */}
            <Card className="bg-card border-border border rounded-sm">
              <CardHeader>
                <CardTitle className="text-base font-medium flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Alert Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingSchedule ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">Status</div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={schedule?.is_active ? 'default' : 'secondary'}
                            className={schedule?.is_active ? 'bg-accent text-white' : 'bg-muted'}
                          >
                            {schedule?.is_active ? 'Active' : 'Paused'}
                          </Badge>
                        </div>
                      </div>
                      <Switch
                        checked={schedule?.is_active ?? false}
                        onCheckedChange={toggleSchedule}
                        disabled={loading || !schedule}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Schedule</div>
                        <div className="text-sm font-medium">
                          {schedule?.cron_expression ? cronToHuman(schedule.cron_expression) : 'Not set'}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Next Alert</div>
                        <div className="text-sm font-medium">
                          {schedule?.is_active ? countdown : 'Paused'}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Last Triggered</div>
                      <div className="text-sm">
                        {formatTimestamp(schedule?.last_run_at ?? undefined)}
                      </div>
                    </div>

                    <Button
                      onClick={triggerManually}
                      disabled={loading}
                      className="w-full bg-primary text-white hover:bg-primary/90"
                      size="sm"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Play className="w-4 h-4 mr-2" />
                      )}
                      Trigger Now
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Latest Price Card */}
            <Card className="bg-card border-border border rounded-sm">
              <CardHeader>
                <CardTitle className="text-base font-medium">Latest Price</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingHistory && !sampleMode ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : !displayLatest ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No price data available yet
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-baseline gap-2">
                      <div className="text-4xl font-semibold tracking-tight">
                        {formatCurrency(displayLatest.current_price)}
                      </div>
                      <Badge variant="outline" className="border-border text-xs">
                        {displayLatest.stock_symbol ?? 'TSLA'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3">
                      {(displayLatest.daily_change_amount ?? 0) >= 0 ? (
                        <div className="flex items-center gap-1 text-accent">
                          <TrendingUp className="w-5 h-5" />
                          <span className="text-lg font-medium">
                            +{formatCurrency(Math.abs(displayLatest.daily_change_amount ?? 0))}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-destructive">
                          <TrendingDown className="w-5 h-5" />
                          <span className="text-lg font-medium">
                            -{formatCurrency(Math.abs(displayLatest.daily_change_amount ?? 0))}
                          </span>
                        </div>
                      )}
                      <Badge
                        variant="outline"
                        className={
                          (displayLatest.daily_change_percentage ?? 0) >= 0
                            ? 'border-accent text-accent'
                            : 'border-destructive text-destructive'
                        }
                      >
                        {formatPercentage(displayLatest.daily_change_percentage)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Market Status</div>
                        <Badge
                          variant="outline"
                          className={
                            displayLatest.market_status === 'Open'
                              ? 'border-accent text-accent'
                              : 'border-muted text-muted-foreground'
                          }
                        >
                          {displayLatest.market_status ?? 'Unknown'}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Updated</div>
                        <div className="text-sm">
                          {formatTimestamp(displayLatest.timestamp)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Agent Info */}
            <Card className="bg-card border-border border rounded-sm">
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">Powered by</div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Stock Alert Agent</div>
                    <Badge variant="outline" className="border-primary text-primary text-xs">
                      Active
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Fetches real-time Tesla stock data and sends email alerts every 10 minutes
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Alert History */}
          <Card className="bg-card border-border border rounded-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-medium">Alert History</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    fetchHistory()
                    fetchSchedule()
                  }}
                  disabled={loadingHistory}
                >
                  <RefreshCw className={`w-4 h-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingHistory && !sampleMode ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : !Array.isArray(displayHistory) || displayHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <Mail className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No alerts sent yet</p>
                  <p className="text-xs mt-1">Alerts will appear here once the schedule runs</p>
                </div>
              ) : (
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-2">
                    {displayHistory.map((alert) => {
                      const data = alert.data
                      const isPositive = (data?.daily_change_amount ?? 0) >= 0

                      return (
                        <div
                          key={alert.id}
                          className="p-3 rounded-sm border border-border bg-background/50 hover:bg-background transition-colors"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-medium">
                                  {formatCurrency(data?.current_price)}
                                </div>
                                {data && (
                                  <Badge
                                    variant="outline"
                                    className={
                                      isPositive
                                        ? 'border-accent text-accent text-xs'
                                        : 'border-destructive text-destructive text-xs'
                                    }
                                  >
                                    {formatPercentage(data.daily_change_percentage)}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatTimestamp(alert.executed_at)}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {data && (
                                <div className={`text-sm font-medium ${isPositive ? 'text-accent' : 'text-destructive'}`}>
                                  {isPositive ? '+' : '-'}
                                  {formatCurrency(Math.abs(data.daily_change_amount ?? 0))}
                                </div>
                              )}
                              <Badge
                                variant={alert.success && data?.email_sent ? 'default' : 'secondary'}
                                className={
                                  alert.success && data?.email_sent
                                    ? 'bg-accent text-white text-xs'
                                    : 'bg-muted text-xs'
                                }
                              >
                                {alert.success && data?.email_sent ? 'Sent' : 'Failed'}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-4 rounded-sm bg-destructive/10 border border-destructive text-destructive text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
