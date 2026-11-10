import React from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router-dom';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="py-16 max-w-lg mx-auto">
      <EmptyState
        icon={<FileQuestion size={28} className="text-ink-muted" />}
        title="Page Not Found (404)"
        description="The page you're looking for doesn't exist."
        action={
          <Link to="/">
            <Button variant="primary" size="sm">
              Return to home
            </Button>
          </Link>
        }
      />
    </div>
  );
};
