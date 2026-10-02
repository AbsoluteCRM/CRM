import { CircleUser } from 'lucide-react'

export default function Header() {
  return (
    <header className="position-fixed top-0 w-full border-b-1 border-b-solid border-b-border py-2 justify-between flex items-center px-4">
      <h1 className="text-xl font-bold">ABSOLUTE CRM</h1>
      <CircleUser size={32} strokeWidth={2} />
    </header>
  )
}
