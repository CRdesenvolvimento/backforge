import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

export function BillingSuccessPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Checkout completed</h1>
        <p className="text-muted-foreground">Stripe redirected back successfully. Webhook sync can take a few seconds to refresh the project subscription.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Subscription is being finalized</CardTitle>
          <CardDescription>If the plan badge does not update immediately, refresh the billing page after a moment.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/billing">Back to Billing</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
