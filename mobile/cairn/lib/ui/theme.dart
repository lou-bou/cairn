import 'package:kit/kit.dart';
import 'package:material_ui/material_ui.dart';

/// Cairn's own colour roles on top of the shared tokens: categories, charts, progress, logo.
@immutable
class CairnColors extends ThemeExtension<CairnColors> {
  const CairnColors({
    required this.categories,
    required this.chartGrid,
    required this.chartAxis,
    required this.chartLine,
    required this.chartIn,
    required this.chartOut,
    required this.chartThreshold,
    required this.progressTrack,
    required this.progressMarker,
    required this.progressMarkerBorder,
    required this.stoneBase,
    required this.stoneMiddle,
  });

  final Map<String, Color> categories;
  final Color chartGrid, chartAxis, chartLine, chartIn, chartOut, chartThreshold;
  final Color progressTrack, progressMarker, progressMarkerBorder;
  final Color stoneBase, stoneMiddle;

  Color category(String id) => categories[id] ?? chartAxis;

  static const light = CairnColors(
    categories: {
      'income': Color(0xFF1D8049),
      'funding': Color(0xFF2B7FB8),
      'savings': Color(0xFFB0791C),
      'other': Color(0xFF8E5BC4),
      'administrative': Color(0xFF4D64C8),
      'luxury': Color(0xFFB8489E),
      'living': Color(0xFFD0573A),
    },
    chartGrid: Color(0xFFEBE8E2),
    chartAxis: Color(0xFF9A958B),
    chartLine: Color(0xFF1C1B19),
    chartIn: Color(0xFF1F7A4D),
    chartOut: Color(0xFFE8846A),
    chartThreshold: Color(0xFFCDC9C0),
    progressTrack: Color(0xFFEBE8E1),
    progressMarker: Color(0xFFFFFFFF),
    progressMarkerBorder: Color(0xFFCDC9C0),
    stoneBase: Color(0xFF1C1B19),
    stoneMiddle: Color(0xFFA39E94),
  );

  static const dark = CairnColors(
    categories: {
      'income': Color(0xFF3FA96C),
      'funding': Color(0xFF4D97D4),
      'savings': Color(0xFFB88328),
      'other': Color(0xFFA47BE0),
      'administrative': Color(0xFF6A7FE6),
      'luxury': Color(0xFFD464B8),
      'living': Color(0xFFDE6A48),
    },
    chartGrid: Color(0xFF26241F),
    chartAxis: Color(0xFF75716A),
    chartLine: Color(0xFFF1EFEA),
    chartIn: Color(0xFF1C7446),
    chartOut: Color(0xFFD4735D),
    chartThreshold: Color(0xFF3D3A35),
    progressTrack: Color(0xFF2A2825),
    progressMarker: Color(0xFF1B1A18),
    progressMarkerBorder: Color(0xFF4A4740),
    stoneBase: Color(0xFFF1EFEA),
    stoneMiddle: Color(0xFF6F6B63),
  );

  @override
  CairnColors copyWith() => this;

  @override
  CairnColors lerp(CairnColors? other, double t) => t < 0.5 || other == null ? this : other;
}

extension CairnContext on BuildContext {
  CairnColors get cairn => Theme.of(this).extension<CairnColors>()!;
}

final cairnLightTheme = buildKitTheme(
  KitTokens.stoneLight,
  Brightness.light,
  extensions: const [CairnColors.light],
);

final cairnDarkTheme = buildKitTheme(
  KitTokens.stoneDark,
  Brightness.dark,
  extensions: const [CairnColors.dark],
);
