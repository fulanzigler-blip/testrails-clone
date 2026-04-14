import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import APITestBuilder from '../components/APITestBuilder';
import { api } from '../lib/api';
import { useNavigate } from 'react-router-dom';

export default function APITestBuilderPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<any>(null);

  React.useEffect(() => {
    if (projectId) {
      api.get(`/api/v1/projects/${projectId}`)
        .then(res => setProject(res.data))
        .catch(console.error);
    }
  }, [projectId]);

  if (!project) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <APITestBuilder
        projectId={projectId!}
        projectPath={project.description}
        onTestGenerated={(test) => {
          console.log('Generated test:', test);
          // Navigate to test runner or save modal
        }}
      />
    </div>
  );
}
