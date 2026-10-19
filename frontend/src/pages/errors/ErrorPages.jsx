import { Link } from 'react-router-dom';
import { Button } from '../../components/ui.jsx';

function Page({ code, title, body }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-start gap-4 px-4 py-20">
      <p className="text-sm font-semibold text-indigo-700">{code}</p>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-slate-700">{body}</p>
      <Link to="/"><Button>Go to home</Button></Link>
    </div>
  );
}

export const NotFoundPage = () => <Page code="404" title="Page not found" body="The page you are looking for does not exist or has moved." />;
export const ForbiddenPage = () => <Page code="403" title="You do not have access" body="Your role does not allow this page. Ask your owner if you need access." />;
export const ServerErrorPage = () => <Page code="500" title="Something went wrong" body="We have logged the problem. Please try again in a moment." />;
