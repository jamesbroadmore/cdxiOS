'use client'

import { useEffect, useState, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { Send, Loader2, Zap } from 'lucide-react'

interface Agent {
  id: string
  name: string
  role: string
  description: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface Conversation {
  id: string
  agent_id: string
  title: string
  messages: Message[]
}

export default function CopilotPage() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [agentsData, conversationsData] = await Promise.all([
          api.get('/api/agents'),
          api.get('/api/conversations'),
        ])
        setAgents(agentsData)
        setConversations(conversationsData)
        if (agentsData.length > 0) {
          setSelectedAgent(agentsData[0])
        }
      } catch (error) {
        console.error('Failed to load copilot data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function startConversation(agent: Agent) {
    try {
      const conversation = await api.post('/api/conversations', {
        agent_id: agent.id,
        title: `Chat with ${agent.name}`,
      })
      setCurrentConversation(conversation)
      setMessages([])
      setSelectedAgent(agent)
    } catch (error) {
      console.error('Failed to start conversation:', error)
    }
  }

  async function sendMessage() {
    if (!input.trim() || !currentConversation || sending) return

    const userMessage = input
    setInput('')
    setSending(true)

    setMessages((prev) => [...prev, { role: 'user', content: userMessage, timestamp: new Date() }])

    try {
      const response = await api.post(`/api/conversations/${currentConversation.id}/chat`, {
        content: userMessage,
      })

      setMessages((prev) => [...prev, { role: 'assistant', content: response.message, timestamp: new Date() }])
    } catch (error) {
      console.error('Failed to send message:', error)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error processing your message.', timestamp: new Date() },
      ])
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
          <p className="text-muted-foreground">Loading Copilot...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 h-full flex flex-col">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <Zap className="w-8 h-8 text-accent" />
          AI Copilot
        </h1>
        <p className="text-muted-foreground mt-1">Chat with AI agents to accelerate your work</p>
      </div>

      {!currentConversation ? (
        <div className="space-y-6">
          <div>
            <h2 className="font-semibold text-foreground mb-3">Select an Agent</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <Card
                  key={agent.id}
                  className="cursor-pointer hover:border-primary/50 hover:shadow-lg transition bg-card border-border"
                  onClick={() => startConversation(agent)}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    <CardDescription>{agent.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Badge>{agent.role}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          <Card className="bg-card border-border flex flex-col flex-1 min-h-0">
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{selectedAgent?.name}</CardTitle>
                  <CardDescription>{selectedAgent?.description}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentConversation(null)
                    setMessages([])
                  }}
                >
                  New Chat
                </Button>
              </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center">
                  <p className="text-muted-foreground">Start a conversation by typing a message below...</p>
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground border border-border'
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {msg.timestamp.toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-muted px-4 py-2 rounded-lg border border-border">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </CardContent>

            <div className="border-t border-border p-4 space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Type your message..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !sending && sendMessage()}
                  disabled={sending}
                  className="bg-card border-border"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
