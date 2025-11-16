class MR_Player;
class MR_Enemy;

enum EAlignState
{
  AS_Flat = 0,
  AS_Long = 1,
  AS_Short = 2
}

enum EOutcome
{
  OC_Flat,
  OC_Aligned,
  OC_Misaligned
}

class MRUtils
{
  static double Lerp(double a, double b, double t)
  {
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    return a + (b - a) * t;
  }

  static int ClampInt(int value, int low, int high)
  {
    if (value < low) return low;
    if (value > high) return high;
    return value;
  }

  static MR_Enemy FindNearestEnemy(DVector3 origin, double maxDist = 1024)
  {
    MR_Enemy best = null;
    double bestDist = maxDist * maxDist;
    ThinkerIterator it = ThinkerIterator.Create('MR_Enemy');
    Actor a;
    while ((a = Actor(it.Next())) != null)
    {
      double dist = (a.Pos - origin).LengthSquared();
      if (dist < bestDist)
      {
        bestDist = dist;
        best = MR_Enemy(a);
      }
    }
    return best;
  }

  static MR_Player GetActivePlayer()
  {
    if (players[consoleplayer] == null)
      return null;
    return MR_Player(players[consoleplayer].mo);
  }
}
