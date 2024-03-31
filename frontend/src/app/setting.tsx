import { CardTitle, CardDescription, CardHeader, CardContent, CardFooter, Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
export default function Setting() {
  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      <header className="flex items-center justify-center h-20 bg-white shadow-md dark:bg-gray-800">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">REMOTE Terminal</h1>
      </header>
      <main className="flex flex-col items-center justify-center flex-grow">
        <Card className="w-full max-w-md mx-4">
          <CardHeader>
            <CardTitle className="text-2xl">Connect to Server</CardTitle>
            <CardDescription>Enter the IP address of the server you want to connect to.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ip-address">IP Address</Label>
              <Input id="ip-address" placeholder="192.168.1.1" required type="text" />
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full">Connect</Button>
          </CardFooter>
        </Card>
      </main>
    </div>
  )
}