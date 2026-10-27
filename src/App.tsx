/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { FleetProvider, useFleet } from './context/FleetContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { ActivityAlerts } from './components/layout/ActivityAlerts';
import { ClusterOverview } from './components/dashboard/ClusterOverview';
import { ContainerList } from './components/containers/ContainerList';
import { ComposeExplorer } from './components/compose/ComposeExplorer';
import { VmHostManager } from './components/vms/VmHostManager';
import { StorageNetworkView } from './components/storage/StorageNetworkView';
import { SpringBootViewer } from './components/springboot/SpringBootViewer';
import { ContainerLogsModal } from './components/containers/ContainerLogsModal';
import { ContainerShellModal } from './components/containers/ContainerShellModal';
import { ContainerInspectModal } from './components/containers/ContainerInspectModal';
import { DeployContainerModal } from './components/containers/DeployContainerModal';
import { AddVmModal } from './components/vms/AddVmModal';
import { 
  LayoutDashboard, 
  Boxes, 
  FileCode2, 
  Server, 
  HardDrive, 
  Cpu 
} from 'lucide-react';

const DashboardContent: React.FC = () => {
  const { activeTab, setActiveTab } = useFleet();

  const mobileNavItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'containers', label: 'Containers', icon: Boxes },
    { id: 'compose', label: 'Compose', icon: FileCode2 },
    { id: 'vms', label: 'VM Hosts', icon: Server },
    { id: 'spring_boot', label: 'Spring Boot', icon: Cpu },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Application Header */}
      <Header />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Desktop Sidebar */}
        <Sidebar />

        {/* Dynamic Center Stage */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full pb-20 md:pb-8">
          {activeTab === 'overview' && <ClusterOverview />}
          {activeTab === 'containers' && <ContainerList />}
          {activeTab === 'compose' && <ComposeExplorer />}
          {activeTab === 'vms' && <VmHostManager />}
          {activeTab === 'storage_network' && <StorageNetworkView />}
          {activeTab === 'spring_boot' && <SpringBootViewer />}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-2 flex items-center justify-around z-30">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex flex-col items-center gap-1 py-1 px-2 rounded-lg text-[10px] font-medium transition-colors ${
                isActive ? 'text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Interactive Modals and Flyouts */}
      <ContainerLogsModal />
      <ContainerShellModal />
      <ContainerInspectModal />
      <DeployContainerModal />
      <AddVmModal />

      {/* Activity Toast Notifications */}
      <ActivityAlerts />
    </div>
  );
};

export default function App() {
  return (
    <FleetProvider>
      <DashboardContent />
    </FleetProvider>
  );
}
