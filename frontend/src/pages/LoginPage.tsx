import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Wallet, Mail, Lock, User, ArrowRight, Sparkles, TrendingUp, PiggyBank, Shield } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

/* ── Floating particles on the form panel ── */
const Particle = ({ delay, isDark }: { delay: number; isDark: boolean }) => {
  const style = useMemo(() => ({
    left: `${Math.random() * 100}%`,
    width: Math.random() * 3 + 1.5,
    height: Math.random() * 3 + 1.5,
  }), [])
  return (
    <motion.span
      className={cn("absolute rounded-full pointer-events-none", isDark ? "bg-white/[0.07]" : "bg-blue-400/[0.12]")}
      style={{ ...style, bottom: -10 }}
      animate={{ y: [0, -(window.innerHeight + 20)], opacity: [0, 1, 1, 0] }}
      transition={{ duration: Math.random() * 6 + 8, delay, repeat: Infinity, ease: "linear" }}
    />
  )
}
const FloatingParticles = ({ isDark }: { isDark: boolean }) => {
  const particles = useMemo(() => Array.from({ length: 18 }, (_, i) => i), [])
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((i) => (
        <Particle key={i} delay={i * 0.7} isDark={isDark} />
      ))}
    </div>
  )
}

/* ── Animated counting number ── */
function CountUp({ target, suffix = '' }: { target: string; suffix?: string }) {
  const numeric = parseInt(target.replace(/[^0-9]/g, ''), 10)
  const prefix = target.match(/^[^0-9]*/)?.[0] ?? ''
  const rest = target.replace(/^[^0-9]*[0-9,]+/, '')
  const [val, setVal] = useState(0)
  useEffect(() => {
    let frame: number
    const duration = 2000
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)          // easeOutCubic
      setVal(Math.round(eased * numeric))
      if (t < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [numeric])
  return <>{prefix}{val.toLocaleString('en-IN')}{rest}{suffix}</>
}

// Floating orb component for background - grayscale
const FloatingOrb = ({ delay, duration, size, opacity, initialX, initialY }: {
  delay: number
  duration: number
  size: number
  opacity: number
  initialX: string
  initialY: string
}) => (
  <motion.div
    className="absolute rounded-full blur-3xl"
    style={{
      width: size,
      height: size,
      background: `rgba(255, 255, 255, ${opacity})`,
      left: initialX,
      top: initialY,
    }}
    animate={{
      x: [0, 30, -20, 15, 0],
      y: [0, -25, 20, -15, 0],
      scale: [1, 1.05, 0.98, 1.02, 1],
    }}
    transition={{
      duration,
      delay,
      repeat: Infinity,
      ease: "easeInOut",
    }}
  />
)

// Feature card for left panel - Enhanced hover effects
const FeatureCard = ({ icon: Icon, title, description, delay }: {
  icon: typeof Sparkles
  title: string
  description: string
  delay: number
}) => (
  <motion.div
    initial={{ opacity: 0, x: -20 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    whileHover={{ scale: 1.03, x: 8, backgroundColor: 'rgba(255,255,255,0.12)' }}
    whileTap={{ scale: 0.98 }}
    className="flex items-start gap-3 p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 cursor-pointer transition-all duration-300 hover:shadow-lg hover:shadow-white/5 hover:border-white/20 group"
  >
    <motion.div 
      className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-white/20 transition-colors duration-300"
      whileHover={{ rotate: 5, scale: 1.1 }}
    >
      <Icon className="w-5 h-5 text-white group-hover:text-amber-200 transition-colors duration-300" />
    </motion.div>
    <div>
      <h3 className="font-semibold text-white text-sm group-hover:text-amber-100 transition-colors duration-300">{title}</h3>
      <p className="text-white/50 text-xs mt-0.5 group-hover:text-white/70 transition-colors duration-300">{description}</p>
    </div>
  </motion.div>
)

// Animated input component - Theme aware
const AnimatedInput = ({ 
  icon: Icon, 
  label, 
  type, 
  value, 
  onChange, 
  placeholder,
  delay,
  isDark 
}: {
  icon: typeof Mail
  label: string
  type: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  placeholder: string
  delay: number
  isDark: boolean
}) => {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <label className={cn("block text-sm font-medium mb-1.5", isDark ? "text-neutral-300" : "text-gray-600")}>{label}</label>
      <motion.div 
        className="relative"
        animate={{ scale: isFocused ? 1.01 : 1 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className={cn(
            "absolute inset-0 rounded-xl blur-sm",
            isDark ? "bg-gradient-to-r from-[#2a2a2a] via-[#242424] to-[#2a2a2a]" : "bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200"
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: isFocused ? 0.5 : 0 }}
          transition={{ duration: 0.3 }}
        />
        <div className="relative">
          <Icon className={cn(
            `absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors duration-300`,
            isFocused 
              ? isDark ? 'text-white' : 'text-gray-900'
              : isDark ? 'text-neutral-500' : 'text-gray-400'
          )} />
          <input
            type={type}
            value={value}
            onChange={onChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            className={cn(
              `w-full pl-11 pr-4 py-3.5 border-2 rounded-xl text-sm transition-all duration-300 outline-none`,
              isFocused 
                ? isDark 
                  ? 'border-amber-500/60 shadow-lg shadow-amber-500/10 bg-[#1a1a1a] text-white'
                  : 'border-gray-900 shadow-lg shadow-gray-900/5 bg-white text-gray-900'
                : isDark
                  ? 'border-white/10 hover:border-white/20 bg-[#1a1a1a] text-white'
                  : 'border-gray-200 hover:border-gray-300 bg-white text-gray-900'
            )}
          />
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const navigate = useNavigate()
  const setUser = useAppStore((s) => s.setUser)
  const settings = useAppStore((s) => s.settings)
  const isDark = settings.darkMode

  // Track mouse for subtle parallax effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX / window.innerWidth - 0.5) * 20,
        y: (e.clientY / window.innerHeight - 0.5) * 20,
      })
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup'
      const body = isLogin
        ? { email, password }
        : { email, password, full_name: name }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Authentication failed')
      }
      const data = await res.json()
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.full_name || name || 'User',
        created_at: new Date().toISOString(),
        isNewAccount: !isLogin,
      })
      localStorage.setItem('access_token', data.access_token)
      toast.success(isLogin ? `Welcome back, ${data.user.full_name || 'User'}!` : `Account created! Welcome, ${name}!`)
      navigate('/')
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      toast.error(errorMessage || (isLogin ? 'Login failed. Check your credentials.' : 'Signup failed. Try again.'))
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo: true }),
      })
      if (!res.ok) throw new Error('Demo failed')
      const data = await res.json()
      setUser({
        id: data.user.id,
        email: data.user.email,
        name: data.user.full_name,
        created_at: new Date().toISOString(),
      })
      localStorage.setItem('access_token', data.access_token)
    } catch {
      setUser({
        id: 'demo-user-001',
        email: 'rahul@demo.com',
        name: 'Rahul Kumar',
        created_at: new Date().toISOString(),
      })
      localStorage.setItem('access_token', 'demo-token')
    }
    toast.success('Welcome to Incomiq!')
    navigate('/')
    setLoading(false)
  }

  const features = [
    { icon: TrendingUp, title: 'Smart Analytics', description: 'AI-powered insights for your finances' },
    { icon: PiggyBank, title: 'Auto Savings', description: 'Rules that save money automatically' },
    { icon: Shield, title: 'Bank-Grade Security', description: 'Your data is encrypted & secure' },
  ]

  return (
    <div className="min-h-screen flex overflow-hidden">
      {/* Left Panel - Premium Dark (Always Dark) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-black">
        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800/30 via-transparent to-transparent" />
        
        {/* Floating orbs - subtle white */}
        <FloatingOrb delay={0} duration={10} size={400} opacity={0.03} initialX="5%" initialY="15%" />
        <FloatingOrb delay={3} duration={12} size={300} opacity={0.02} initialX="55%" initialY="55%" />
        <FloatingOrb delay={6} duration={14} size={350} opacity={0.025} initialX="25%" initialY="65%" />
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
        
        {/* Content with parallax */}
        <motion.div 
          className="relative z-10 p-12 flex flex-col justify-between w-full"
          style={{
            transform: `translate(${mousePosition.x * 0.3}px, ${mousePosition.y * 0.3}px)`,
          }}
        >
          {/* Logo */}
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="flex items-center gap-3"
          >
            <motion.div 
              className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center"
              whileHover={{ scale: 1.05, rotate: 3 }}
              transition={{ type: "spring", stiffness: 400 }}
            >
              <Wallet className="w-6 h-6 text-black" />
            </motion.div>
            <span className="text-2xl font-bold tracking-tight text-white">Incomiq</span>
          </motion.div>

          {/* Main content */}
          <div className="space-y-8">
            <div>
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="text-4xl font-bold leading-tight text-white relative"
              >
                {/* Shimmer sweep across headline */}
                <motion.span
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 pointer-events-none"
                  animate={{ x: ['-120%', '120%'] }}
                  transition={{ duration: 4, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
                />
                Track Every Rupee.
                <br />
                <span className="text-gray-400">
                  Grow Your Wealth.
                </span>
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="text-base text-gray-500 mt-4 max-w-md leading-relaxed"
              >
                India's smartest income & expense tracker with AI-powered savings suggestions and personalized investment recommendations.
              </motion.p>
            </div>

            {/* Feature cards */}
            <div className="space-y-3">
              {features.map((feature, i) => (
                <FeatureCard key={feature.title} {...feature} delay={0.5 + i * 0.1} />
              ))}
            </div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="flex gap-10"
            >
              {[
                { label: 'Gig Workers', value: '7.7M+' },
                { label: 'Savings Potential', value: '₹1,500Cr' },
                { label: 'SDG Goals', value: '3 Aligned' },
              ].map((stat, i) => (
                <motion.div 
                  key={stat.label}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.9 + i * 0.1, type: "spring" }}
                  whileHover={{ scale: 1.05 }}
                  className="cursor-default"
                >
                  <p className="text-3xl font-bold text-white"><CountUp target={stat.value} /></p>
                  <p className="text-sm text-gray-600">{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Footer */}
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
            className="text-sm text-gray-700"
          >
            SDG 1: No Poverty · SDG 8: Decent Work · SDG 10: Reduced Inequality
          </motion.p>
        </motion.div>
      </div>

      {/* Right Panel - Clean White Form */}
      <div className={cn(
        "flex-1 flex items-center justify-center p-6 relative overflow-hidden",
        isDark ? "bg-[#0a0a0a]" : "bg-white"
      )}>
        {/* Floating particles */}
        <FloatingParticles isDark={isDark} />

        {/* Subtle dot pattern */}
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, ${isDark ? 'white' : 'black'} 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }} />
        
        {/* Subtle glow that follows mouse */}
        <motion.div
          className={cn(
            "absolute w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none opacity-40",
            isDark ? "bg-gradient-to-r from-[#1a1a1a] to-[#141414]" : "bg-gradient-to-r from-gray-100 to-gray-50"
          )}
          animate={{
            x: mousePosition.x * 8,
            y: mousePosition.y * 8,
          }}
          transition={{ type: "spring", damping: 30, stiffness: 200 }}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="w-full max-w-md relative z-10"
        >
          {/* Mobile logo */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="lg:hidden flex items-center gap-2 mb-8 justify-center"
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center",
              isDark ? "bg-white" : "bg-black"
            )}>
              <Wallet className={cn("w-6 h-6", isDark ? "text-black" : "text-white")} />
            </div>
            <span className={cn("text-xl font-bold", isDark ? "text-white" : "text-gray-900")}>Incomiq</span>
          </motion.div>

          {/* Card with animated gradient ring */}
          <div className="relative rounded-3xl p-[1px]">
            {/* Rotating gradient border */}
            <motion.div
              className={cn(
                "absolute -inset-[1px] rounded-3xl opacity-0 blur-[2px]",
                isDark
                  ? "bg-[conic-gradient(from_0deg,transparent_40%,rgba(251,191,36,0.25),transparent_60%)]"
                  : "bg-[conic-gradient(from_0deg,transparent_40%,rgba(59,130,246,0.18),transparent_60%)]"
              )}
              animate={{ rotate: 360, opacity: [0.4, 0.7, 0.4] }}
              transition={{ rotate: { duration: 6, repeat: Infinity, ease: 'linear' }, opacity: { duration: 3, repeat: Infinity, ease: 'easeInOut' } }}
            />
          <motion.div 
            className={cn(
              "rounded-3xl p-8 border shadow-xl relative",
              isDark ? "bg-[#141414] border-white/8 shadow-black/60" : "bg-white border-gray-100 shadow-gray-100/50"
            )}
            whileHover={{ boxShadow: isDark ? "0 25px 50px -12px rgba(0,0,0,0.3)" : "0 25px 50px -12px rgba(0,0,0,0.08)" }}
            transition={{ duration: 0.3 }}
          >
            {/* Header with animation */}
            <AnimatePresence mode="wait">
              <motion.div
                key={isLogin ? 'login' : 'signup'}
                initial={{ opacity: 0, x: isLogin ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isLogin ? 20 : -20 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className={cn("text-2xl font-bold mb-1", isDark ? "text-white" : "text-gray-900")}>
                  {isLogin ? 'Welcome back' : 'Create account'}
                </h2>
                <p className={cn("mb-6 text-sm", isDark ? "text-neutral-400" : "text-gray-500")}>
                  {isLogin ? 'Sign in to continue tracking your hustle' : 'Start tracking your income today'}
                </p>
              </motion.div>
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-4">
              <AnimatePresence>
                {!isLogin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <AnimatedInput
                      icon={User}
                      label="Full Name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Rahul Kumar"
                      delay={0}
                      isDark={isDark}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatedInput
                icon={Mail}
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                delay={0.1}
                isDark={isDark}
              />

              <AnimatedInput
                icon={Lock}
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                delay={0.2}
                isDark={isDark}
              />

              {/* Submit button - Premium black with enhanced hover */}
              <motion.button
                type="submit"
                disabled={loading}
                className="w-full mt-6 py-4 px-6 bg-gradient-to-r from-black via-gray-900 to-black hover:from-gray-800 hover:via-black hover:to-gray-800 text-white font-semibold rounded-xl flex items-center justify-center gap-2 relative overflow-hidden group disabled:opacity-70 transition-all duration-500 shadow-lg hover:shadow-2xl hover:shadow-gray-900/30"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {/* Shimmer effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                />
                {/* Glow effect on hover */}
                <motion.div
                  className={cn(
                    "absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity duration-500",
                    isDark ? "from-amber-500/0 via-amber-400/8 to-amber-500/0" : "from-blue-500/0 via-blue-400/8 to-blue-500/0"
                  )}
                />
                <span className="relative flex items-center gap-2">
                  {loading ? (
                    <motion.div
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    />
                  ) : (
                    <>
                      {isLogin ? 'Sign In' : 'Create Account'}
                      <motion.span
                        className="inline-block"
                        animate={{ x: [0, 3, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </motion.span>
                    </>
                  )}
                </span>
              </motion.button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className={cn("w-full border-t", isDark ? "border-white/8" : "border-gray-100")} />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className={cn("px-3 text-sm", isDark ? "bg-[#141414] text-neutral-500" : "bg-white text-gray-400")}>or continue with</span>
              </div>
            </div>

            {/* Demo button - Enhanced hover */}
            <motion.button
              onClick={handleDemoLogin}
              disabled={loading}
              className={cn(
                "w-full py-3.5 px-6 font-medium rounded-xl flex items-center justify-center gap-2 transition-all duration-300 border group shadow-sm hover:shadow-md text-sm",
                isDark 
                  ? "bg-gradient-to-r from-[#1a1a1a] via-[#141414] to-[#1a1a1a] hover:from-amber-950/40 hover:via-[#141414] hover:to-amber-950/40 text-neutral-200 hover:text-amber-200 border-white/10 hover:border-amber-500/40" 
                  : "bg-gradient-to-r from-gray-50 via-white to-gray-50 hover:from-blue-50 hover:via-white hover:to-blue-50 text-gray-700 hover:text-blue-700 border-gray-200 hover:border-blue-300"
              )}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
            >
              <motion.span
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              >
                <Sparkles className={cn("w-4 h-4", isDark ? "text-amber-500" : "text-blue-500")} />
              </motion.span>
              Try Demo (No Account Needed)
            </motion.button>

            {/* Toggle */}
            <motion.p 
              className={cn("text-center text-sm mt-6", isDark ? "text-neutral-400" : "text-gray-500")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <motion.button
                onClick={() => setIsLogin(!isLogin)}
                className={cn(
                  "font-semibold transition-all duration-300 relative group",
                  isDark ? "text-white hover:text-amber-500" : "text-gray-900 hover:text-blue-600"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isLogin ? 'Sign up' : 'Sign in'}
                <span className={cn(
                  "absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r group-hover:w-full transition-all duration-300",
                  isDark ? "from-amber-400 to-orange-500" : "from-blue-400 to-indigo-500"
                )} />
              </motion.button>
            </motion.p>
          </motion.div>
          </div>{/* close gradient ring wrapper */}

          {/* Trust badges - Enhanced hover */}
          <motion.div 
            className="flex items-center justify-center gap-6 mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <motion.div 
              className={cn(
                "flex items-center gap-1.5 text-xs cursor-default transition-colors duration-300",
                isDark ? "text-neutral-500 hover:text-neutral-300" : "text-gray-400 hover:text-gray-600"
              )}
              whileHover={{ scale: 1.05, y: -1 }}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>256-bit SSL</span>
            </motion.div>
            <div className={cn("w-1 h-1 rounded-full", isDark ? "bg-neutral-600" : "bg-gray-300")} />
            <motion.div 
              className={cn(
                "flex items-center gap-1.5 text-xs cursor-default transition-colors duration-300",
                isDark ? "text-neutral-500 hover:text-neutral-300" : "text-gray-400 hover:text-gray-600"
              )}
              whileHover={{ scale: 1.05, y: -1 }}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>GDPR Compliant</span>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}
