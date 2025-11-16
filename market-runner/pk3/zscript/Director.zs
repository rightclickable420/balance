class MR_Director : Actor
{
  static MR_Director Instance;

  double Sigma;
  double LossMag;
  int NextBeatTic;
  int ResolveAtTic;
  EAlignState NextBit;
  EOutcome LastOutcome;
  Array<EAlignState> BitHistory;

  Default
  {
    +NOINTERACTION
    +NOBLOCKMAP
    +NOSECTOR
    RenderStyle None;
  }

  override void PostBeginPlay()
  {
    Super.PostBeginPlay();
    Instance = self;
    Sigma = 0.45;
    LossMag = 0.35;
    LastOutcome = EOutcome.OC_Flat;
    BitHistory.Clear();
    NextBit = ChooseBit();
    NextBeatTic = level.time + BeatDelay();
  }

  override void Destroy()
  {
    if (Instance == self)
      Instance = null;
    Super.Destroy();
  }

  override void Tick()
  {
    Super.Tick();
    if (level == null)
      return;

    if (ResolveAtTic > 0 && level.time >= ResolveAtTic)
    {
      Resolve();
      ResolveAtTic = 0;
    }

    if (level.time >= NextBeatTic)
    {
      NextBit = ChooseBit();
      ResolveAtTic = level.time + 12; // ~0.34s windup
      NextBeatTic = level.time + BeatDelay();
      SpawnBeatEnemy();
    }
  }

  static MR_Director GetInstance()
  {
    return Instance;
  }

  double BeatSecs()
  {
    return MRUtils.Lerp(0.7, 2.0, 1.0 - Sigma);
  }

  int BeatDelay()
  {
    return max(12, int(BeatSecs() * 35.0));
  }

  int KillsPerBeat()
  {
    return 1 + int(Sigma * 2.0);
  }

  int VolleyDamage()
  {
    return MRUtils.ClampInt(int((0.5 * Sigma + 0.5 * LossMag) * 40.0), 1, 40);
  }

  EAlignState ChooseBit()
  {
    return (Random(0, 1) == 0) ? EAlignState.AS_Long : EAlignState.AS_Short;
  }

  void Resolve()
  {
    MR_Player player = MRUtils.GetActivePlayer();
    if (player == null)
      return;

    if (player.AlignState == EAlignState.AS_Flat)
    {
      LastOutcome = EOutcome.OC_Flat;
      if (player.Streak > 0)
        player.Streak--;
      ClearEnemies();
      PushBit(EAlignState.AS_Flat);
      return;
    }

    if (player.AlignState == NextBit)
    {
      LastOutcome = EOutcome.OC_Aligned;
      AutoKill(KillsPerBeat());
      player.Streak++;
    }
    else
    {
      LastOutcome = EOutcome.OC_Misaligned;
      VolleyAll(VolleyDamage());
      player.Streak = 0;
    }
    PushBit(NextBit);
  }

  void AutoKill(int count)
  {
    MR_Player player = MRUtils.GetActivePlayer();
    if (player == null)
      return;

    for (int i = 0; i < count; i++)
    {
      MR_Enemy enemy = MRUtils.FindNearestEnemy(player.Pos, 1024);
      if (enemy == null)
        break;
      enemy.Pop();
    }
  }

  void VolleyAll(int dmg)
  {
    MR_Player player = MRUtils.GetActivePlayer();
    if (player == null)
      return;

    ThinkerIterator it = ThinkerIterator.Create('MR_Enemy');
    MR_Enemy enemy;
    while ((enemy = MR_Enemy(it.Next())) != null)
    {
      enemy.VolleyAt(player, dmg);
    }
    player.ApplyVolleyDamage(dmg);
  }

  void SpawnBeatEnemy()
  {
    MR_Player player = MRUtils.GetActivePlayer();
    if (player == null || player.AlignState == EAlignState.AS_Flat)
      return;

    int spawnCount = 1 + int(Sigma * 2.0);
    for (int i = 0; i < spawnCount; i++)
    {
      double offX = Random(-64, 64);
      double offY = 192 + Random(0, 128) + (i * 32);
      DVector3 spot = (self != null) ? self.Pos : DVector3(0, 0, 0);
      spot.X += offX;
      spot.Y += offY;
      spot.Z = player.Z;
      Spawn("MR_Enemy", spot, ALLOW_REPLACE);
    }
  }

  void ClearEnemies()
  {
    ThinkerIterator it = ThinkerIterator.Create('MR_Enemy');
    Actor enemy;
    while ((enemy = Actor(it.Next())) != null)
    {
      enemy.Destroy();
    }
  }

  void ForceFlatPurge()
  {
    ClearEnemies();
  }

  void PushBit(EAlignState bit)
  {
    BitHistory.Push(bit);
    if (BitHistory.Size() > 8)
      BitHistory.Delete(0);
  }

  Array<EAlignState> GetBitHistory()
  {
    return BitHistory;
  }

  EOutcome GetOutcome()
  {
    return LastOutcome;
  }

  EAlignState GetNextBit()
  {
    return NextBit;
  }

  void SetSigma(double value)
  {
    Sigma = clamp(value, 0.0, 1.0);
  }

  void SetLoss(double value)
  {
    LossMag = clamp(value, 0.0, 1.0);
  }

  double GetSigma()
  {
    return Sigma;
  }

  double GetLoss()
  {
    return LossMag;
  }
}

class MR_Bridge : StaticEventHandler
{
  static clearscope void ToggleLS()
  {
    MR_Player p = MRUtils.GetActivePlayer();
    if (p != null)
      p.ToggleLongShort();
  }

  static clearscope void ToggleFlat()
  {
    MR_Player p = MRUtils.GetActivePlayer();
    if (p != null)
      p.ToggleFlat();
  }

  static clearscope void ToggleAuto()
  {
    MR_Player p = MRUtils.GetActivePlayer();
    if (p != null)
      p.ToggleAutoMode();
  }

  static clearscope void SetAlign(int state)
  {
    MR_Player.SetAlignState(state);
  }

  static clearscope void SetSigma(int raw)
  {
    MR_Director dir = MR_Director.Instance;
    if (dir == null)
      return;
    dir.SetSigma(NormalizeScalar(raw));
  }

  static clearscope void SetLoss(int raw)
  {
    MR_Director dir = MR_Director.Instance;
    if (dir == null)
      return;
    dir.SetLoss(NormalizeScalar(raw));
  }

  static double NormalizeScalar(int raw)
  {
    double value = raw;
    if (abs(raw) > 1024)
    {
      value = raw / 65536.0;
    }
    else if (raw > 1 && raw <= 100)
    {
      value = raw / 100.0;
    }
    return clamp(value, 0.0, 1.0);
  }
}
