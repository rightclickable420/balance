class MR_StatusBar : BaseStatusBar
{
  override void Draw(int state)
  {
    Super.Draw(state);

    MR_Player player = MRUtils.GetActivePlayer();
    if (player == null)
      return;

    MR_Director dir = MR_Director.GetInstance();
    string label = StringTable.Localize("$MR_FLAT");
    int color = Font.CR_Green;

    if (dir != null)
    {
      switch (dir.GetOutcome())
      {
        case EOutcome.OC_Aligned:
          label = StringTable.Localize("$MR_ALIGNED");
          color = Font.CR_LightGreen;
          break;
        case EOutcome.OC_Misaligned:
          label = StringTable.Localize("$MR_LOSS");
          color = Font.CR_Red;
          break;
        default:
          label = StringTable.Localize("$MR_FLAT");
          color = Font.CR_Green;
          break;
      }
    }

    SetFont("BIGFONT");
    DrawString(label, 160, 12, DI_SCREEN_CENTER|DI_SCREEN_TOP, color);

    string streak = String.Format(StringTable.Localize("$MR_STREAK"), player.Streak);
    string vol = String.Format(StringTable.Localize("$MR_VOL"), dir != null ? dir.GetSigma() : 0.0);
    string hp = "HP " .. player.health;

    SetFont("SMALLFONT");
    DrawString(streak, 8, 12, DI_SCREEN_TOP|DI_SCREEN_LEFT, Font.CR_White);
    DrawString(vol, 8, 28, DI_SCREEN_TOP|DI_SCREEN_LEFT, Font.CR_Gold);
    DrawString(hp, 312, 12, DI_SCREEN_TOP|DI_SCREEN_RIGHT, Font.CR_Cyan);

    if (dir != null)
    {
      string trail = BuildTrail(dir);
      DrawString(trail, 160, 40, DI_SCREEN_CENTER|DI_SCREEN_TOP, Font.CR_LightBlue);
      string nextBit = "NEXT: " .. BitLabel(dir.GetNextBit());
      DrawString(nextBit, 312, 32, DI_SCREEN_TOP|DI_SCREEN_RIGHT, Font.CR_Orange);
    }
  }

  string BuildTrail(MR_Director dir)
  {
    string result = "";
    Array<EAlignState> bits = dir.GetBitHistory();
    for (int i = 0; i < bits.Size(); i++)
    {
      result = result .. BitLabel(bits[i]);
      if (i < bits.Size() - 1)
        result = result .. " ";
    }
    return result;
  }

  string BitLabel(EAlignState bit)
  {
    switch (bit)
    {
      case EAlignState.AS_Long: return "L";
      case EAlignState.AS_Short: return "S";
      default: return "-";
    }
  }
}
