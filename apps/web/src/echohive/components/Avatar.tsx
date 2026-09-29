import React, { useEffect, useState } from 'react';

interface Props {
  username: string;
  avatarUrl?: string | null;
  className?: string;
}

const Avatar: React.FC<Props> = ({ username, avatarUrl, className = '' }) => {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [avatarUrl]);

  return (
    <span className={`avatar ${className}`} aria-label={`${username}'s profile image`}>
      {avatarUrl && !imageFailed
        ? <img src={avatarUrl} alt="" onError={() => setImageFailed(true)} />
        : <span aria-hidden="true">{username.slice(0, 2).toUpperCase()}</span>}
    </span>
  );
};

export default Avatar;