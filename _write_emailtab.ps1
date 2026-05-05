$content = @" 
'use client' 
 
import { useState, useEffect } from 'react' 
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card' 
import { Button } from '@/components/ui/button' 
import { Input } from '@/components/ui/input' 
import { Label } from '@/components/ui/label' 
import { Mail, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react' 
import { toast } from 'sonner' 
 
interface SmtpConfig { 
  host: string 
  port: number 
  username: string 
  password: string 
  fromEmail: string 
} 
 
export function EmailTab() { 
  const [config, setConfig] = useState<SmtpConfig>({ 
    host: '', 
    port: 587, 
    username: '', 
    password: '', 
    fromEmail: '', 
  }) 
  const [loading, setLoading] = useState(true) 
  const [saving, setSaving] = useState(false) 
  const [testing, setTesting] = useState(false) 
  const [testEmail, setTestEmail] = useState('') 
  const [showPassword, setShowPassword] = useState(false) 
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null) 
 
  useEffect(()) { 
    loadConfig() 
  }, []) 
 
  async function loadConfig() { 
    try { 
      const res = await fetch('/api/settings') 
      if (!res.ok) throw new Error('Failed to load settings') 
      const data = await res.json() 
      const smtp = data.uiPreferences?.smtp as SmtpConfig | undefined 
      if (smtp) { 
        setConfig({ 
          host: smtp.host || '', 
          port: smtp.port || 587, 
          username: smtp.username || '', 
          password: smtp.password || '', 
          fromEmail: smtp.fromEmail || '', 
        }) 
      } 
    } catch (err) { 
      console.error('Failed to load email config:', err) 
    } finally { 
      setLoading(false) 
    } 
  } 
 
