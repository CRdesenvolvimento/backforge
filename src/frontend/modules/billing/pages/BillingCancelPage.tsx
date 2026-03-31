import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

export function BillingCancelPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Checkout canceled</h1>
        <p className="text-muted-foreground">No subscription change was applied. You can return to billing whenever you want to resume checkout.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>No changes made</CardTitle>
          <CardDescription>Your current project plan stays active until you start a new checkout session.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/billing">Back to Billing</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
