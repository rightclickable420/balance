class MR_Player : DoomPlayer
{
  EAlignState AlignState;
  int Streak;
  bool AutoMode;
  EAlignState LastManual;

  override void PostBeginPlay()
  {
    Super.PostBeginPlay();
    AlignState = EAlignState.AS_Flat;
    LastManual = EAlignState.AS_Long;
    Streak = 0;
    if (player != null)
    {
      player.viewheight = 48;
    }
  }

  override void Tick()
  {
    Super.Tick();
    if (AlignState == EAlignState.AS_Flat)
    {
      HealFlatTick();
    }
  }

  void ToggleLongShort()
  {
    if (AlignState == EAlignState.AS_Flat)
    {
      AlignState = LastManual;
      A_StartSound("ui/switch", CHAN_AUTO);
      return;
    }

    AlignState = (AlignState == EAlignState.AS_Long) ? EAlignState.AS_Short : EAlignState.AS_Long;
    LastManual = AlignState;
    A_StartSound("ui/switch", CHAN_AUTO);
  }

  void ToggleFlat()
  {
    if (AlignState == EAlignState.AS_Flat)
    {
      AlignState = LastManual;
      A_StartSound("ui/switch", CHAN_AUTO);
    }
    else
    {
      LastManual = AlignState;
      AlignState = EAlignState.AS_Flat;
      A_StartSound("ui/flat", CHAN_AUTO);
      MR_Director dir = MR_Director.GetInstance();
      if (dir != null)
        dir.ForceFlatPurge();
    }
  }

  void ToggleAutoMode()
  {
    AutoMode = !AutoMode;
  }

  static void SetAlignState(int s)
  {
    MR_Player p = MRUtils.GetActivePlayer();
    if (p == null || !p.AutoMode)
      return;
    if (s < 0 || s > 2)
      return;
    p.ApplyExternalAlign(EAlignState(s));
  }

  void ApplyExternalAlign(EAlignState state)
  {
    AlignState = state;
    if (AlignState != EAlignState.AS_Flat)
    {
      LastManual = AlignState;
      A_StartSound("ui/switch", CHAN_AUTO);
    }
    else
    {
      A_StartSound("ui/flat", CHAN_AUTO);
    }
  }

  void ApplyVolleyDamage(int dmg)
  {
    if (dmg <= 0)
      return;
    A_SetBlend("#ff4444", 0.6, 8);
    DamageMobj(self, self, null, dmg, 'None', DMG_NO_ARMOR);
  }

  void HealFlatTick()
  {
    if (health < 80)
    {
      health++;
      if (health > 80) health = 80;
    }
  }
}
