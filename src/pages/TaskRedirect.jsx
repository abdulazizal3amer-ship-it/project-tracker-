import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { getTask } from '../lib/api.js';
import { ErrorBox, Spinner } from '../components/ui.jsx';

// Deep link used by notifications: /task/:id → its project with the task open.
export default function TaskRedirect() {
  const { id } = useParams();
  const [target, setTarget] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getTask(id)
      .then((task) => (task ? setTarget(`/projects/${task.project_id}?task=${task.id}`) : setError(new Error('notFound'))))
      .catch(setError);
  }, [id]);

  if (error) return <ErrorBox error={error} />;
  if (target) return <Navigate to={target} replace />;
  return <Spinner />;
}
