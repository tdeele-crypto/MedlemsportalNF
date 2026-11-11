import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UsersPage from "@/pages/UsersPage";
import { AppAdminPanel } from "@/components/admin/AppAdminPanel";

export default function AdminPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("fane") === "app" ? "app" : "brugere";

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto" data-testid="admin-page">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Admin</h1>
      <p className="text-sm text-muted-foreground mt-1">Brugere og indstillinger for appen</p>
      <Tabs value={tab} onValueChange={(v) => setParams({ fane: v })} className="mt-6">
        <TabsList>
          <TabsTrigger value="brugere" data-testid="admin-tab-users">Brugere</TabsTrigger>
          <TabsTrigger value="app" data-testid="admin-tab-app">App admin</TabsTrigger>
        </TabsList>
        <TabsContent value="brugere" className="mt-6">
          <UsersPage embedded />
        </TabsContent>
        <TabsContent value="app" className="mt-6">
          <AppAdminPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
