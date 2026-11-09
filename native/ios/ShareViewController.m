#import "ShareViewController.h"
#import "NearbyMapsResolver.h"
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

static NSString * const NearbyAppGroup = @"group.fr.cowprod.nearbyplaces.shareextension";
static NSString * const NearbyQueueKey = @"nearbyShareQueue";
static NSString * const NearbyCollectionsKey = @"nearbyCollections";
static NSString * const NearbyCategoriesKey = @"nearbyCategories";
static const NSUInteger NearbyQueueLimit = 50;

@interface ShareViewController ()
@property(nonatomic, strong) UIScrollView *scrollView;
@property(nonatomic, strong) NSLayoutConstraint *scrollBottomConstraint;
@property(nonatomic, strong) UIActivityIndicatorView *activityIndicator;
@property(nonatomic, strong) UILabel *statusLabel;
@property(nonatomic, strong) UILabel *urlLabel;
@property(nonatomic, strong) UITextField *nameField;
@property(nonatomic, strong) UITextView *commentView;
@property(nonatomic, strong) UIButton *categoryButton;
@property(nonatomic, strong) UIButton *collectionButton;
@property(nonatomic, copy) NSDictionary *selectedCollection;
@property(nonatomic, copy) NSDictionary *selectedCategory;
@property(nonatomic, copy) NSArray<NSDictionary *> *collections;
@property(nonatomic, strong) UIButton *saveButton;
@property(nonatomic, copy) NSArray<NSDictionary *> *categories;
@property(nonatomic, copy) NSString *sharedURL;
@property(nonatomic, strong) NSMutableArray<NSString *> *sharedTexts;
@property(nonatomic, assign) BOOL startedLoading;
@property(nonatomic, assign) NSUInteger validationGeneration;
@end

@implementation ShareViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor colorWithRed:0.965 green:0.973 blue:0.980 alpha:1.0];
    self.view.tintColor = [UIColor colorWithRed:0.22 green:0.49 blue:0.45 alpha:1.0];
    self.sharedTexts = [NSMutableArray array];
    self.categories = [self loadCategories];
    self.collections = [self loadCollections];
    [self buildForm];
    NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
    [center addObserver:self selector:@selector(keyboardWillChange:) name:UIKeyboardWillChangeFrameNotification object:nil];
    [center addObserver:self selector:@selector(keyboardWillHide:) name:UIKeyboardWillHideNotification object:nil];
}

- (void)viewDidAppear:(BOOL)animated {
    [super viewDidAppear:animated];
    if (self.startedLoading) return;
    self.startedLoading = YES;
    [self loadSharedContent];
}

- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; }

- (NSArray<NSDictionary *> *)canonicalCategories {
    return @[
        @{ @"id": @"culture", @"name": @"Culture" },
        @{ @"id": @"resto", @"name": @"Restaurant" },
        @{ @"id": @"musique", @"name": @"Musique" },
        @{ @"id": @"transport", @"name": @"Transport" },
        @{ @"id": @"occasion", @"name": @"Occasion" },
        @{ @"id": @"modelisme", @"name": @"Modélisme" }
    ];
}

- (NSArray<NSDictionary *> *)loadCategories {
    NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:NearbyAppGroup];
    id stored = [defaults objectForKey:NearbyCategoriesKey];
    if (![stored isKindOfClass:NSArray.class] || [(NSArray *)stored count] == 0) return [self canonicalCategories];
    NSMutableArray *valid = [NSMutableArray array];
    for (id item in (NSArray *)stored) {
        if (![item isKindOfClass:NSDictionary.class]) continue;
        NSString *identifier = [item[@"id"] isKindOfClass:NSString.class] ? item[@"id"] : nil;
        NSString *name = [item[@"name"] isKindOfClass:NSString.class] ? item[@"name"] : nil;
        if (identifier.length && name.length) [valid addObject:@{ @"id": identifier, @"name": name, @"collectionId": [item[@"collectionId"] isKindOfClass:NSString.class] ? item[@"collectionId"] : @"" }];
    }
    return valid.count ? valid : [self canonicalCategories];
}

- (NSArray<NSDictionary *> *)loadCollections {
    NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:NearbyAppGroup];
    id stored = [defaults objectForKey:NearbyCollectionsKey];
    NSMutableArray *choices = [NSMutableArray arrayWithObject:@{@"id":@"", @"name":@"Choisir une collection…"}];
    if (![stored isKindOfClass:NSArray.class]) return choices;
    for (id item in (NSArray *)stored) {
        if (![item isKindOfClass:NSDictionary.class]) continue;
        NSString *identifier = [item[@"id"] isKindOfClass:NSString.class] ? item[@"id"] : nil;
        NSString *name = [item[@"name"] isKindOfClass:NSString.class] ? item[@"name"] : nil;
        if (identifier.length && name.length && ![identifier isEqualToString:@"collection-default"]) {
            [choices addObject:@{@"id":identifier,@"name":name}];
        }
    }
    return choices;
}

- (UILabel *)fieldLabel:(NSString *)text {
    UILabel *label = [[UILabel alloc] init];
    label.text = text;
    label.font = [UIFont preferredFontForTextStyle:UIFontTextStyleSubheadline];
    label.textColor = [UIColor colorWithRed:0.29 green:0.36 blue:0.41 alpha:1.0];
    return label;
}

- (void)buildForm {
    self.scrollView = [[UIScrollView alloc] init];
    self.scrollView.translatesAutoresizingMaskIntoConstraints = NO;
    self.scrollView.keyboardDismissMode = UIScrollViewKeyboardDismissModeInteractive;
    [self.view addSubview:self.scrollView];
    self.scrollBottomConstraint = [self.scrollView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor];
    [NSLayoutConstraint activateConstraints:@[
        [self.scrollView.topAnchor constraintEqualToAnchor:self.view.topAnchor],
        [self.scrollView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [self.scrollView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        self.scrollBottomConstraint
    ]];
    UIStackView *stack = [[UIStackView alloc] init];
    stack.axis = UILayoutConstraintAxisVertical;
    stack.spacing = 12;
    stack.translatesAutoresizingMaskIntoConstraints = NO;
    [self.scrollView addSubview:stack];
    [NSLayoutConstraint activateConstraints:@[
        [stack.topAnchor constraintEqualToAnchor:self.scrollView.contentLayoutGuide.topAnchor constant:18],
        [stack.leadingAnchor constraintEqualToAnchor:self.scrollView.frameLayoutGuide.leadingAnchor constant:20],
        [stack.trailingAnchor constraintEqualToAnchor:self.scrollView.frameLayoutGuide.trailingAnchor constant:-20],
        [stack.bottomAnchor constraintEqualToAnchor:self.scrollView.contentLayoutGuide.bottomAnchor constant:-18]
    ]];
    UILabel *title = [[UILabel alloc] init];
    title.text = @"Ajouter à Nearby Places";
    title.font = [UIFont preferredFontForTextStyle:UIFontTextStyleTitle2];
    title.adjustsFontForContentSizeCategory = YES;
    title.textColor = [UIColor colorWithRed:0.16 green:0.20 blue:0.24 alpha:1.0];
    [stack addArrangedSubview:title];
    self.activityIndicator = [[UIActivityIndicatorView alloc] initWithActivityIndicatorStyle:UIActivityIndicatorViewStyleMedium];
    [self.activityIndicator startAnimating];
    [stack addArrangedSubview:self.activityIndicator];
    self.statusLabel = [[UILabel alloc] init];
    self.statusLabel.text = @"Lecture du lieu partagé…";
    self.statusLabel.numberOfLines = 0;
    self.statusLabel.textColor = UIColor.secondaryLabelColor;
    [stack addArrangedSubview:self.statusLabel];
    self.urlLabel = [[UILabel alloc] init];
    self.urlLabel.numberOfLines = 2;
    self.urlLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleCaption1];
    self.urlLabel.textColor = UIColor.secondaryLabelColor;
    self.urlLabel.hidden = YES;
    [stack addArrangedSubview:self.urlLabel];
    [stack addArrangedSubview:[self fieldLabel:@"Nom *"]];
    self.nameField = [[UITextField alloc] init];
    self.nameField.placeholder = @"Nom du lieu";
    self.nameField.borderStyle = UITextBorderStyleNone;
    self.nameField.backgroundColor = UIColor.whiteColor;
    self.nameField.textColor = UIColor.blackColor;
    self.nameField.keyboardAppearance = UIKeyboardAppearanceLight;
    self.nameField.attributedPlaceholder = [[NSAttributedString alloc] initWithString:@"Nom du lieu" attributes:@{NSForegroundColorAttributeName:UIColor.darkGrayColor}];
    self.nameField.layer.cornerRadius = 10;
    self.nameField.layer.borderWidth = 1;
    self.nameField.layer.borderColor = [UIColor colorWithRed:0.88 green:0.90 blue:0.93 alpha:1].CGColor;
    self.nameField.leftView = [[UIView alloc] initWithFrame:CGRectMake(0,0,12,1)];
    self.nameField.leftViewMode = UITextFieldViewModeAlways;
    [self.nameField.heightAnchor constraintGreaterThanOrEqualToConstant:46].active = YES;
    self.nameField.clearButtonMode = UITextFieldViewModeWhileEditing;
    self.nameField.returnKeyType = UIReturnKeyDone;
    self.nameField.enabled = NO;
    [self.nameField addTarget:self action:@selector(dismissKeyboard) forControlEvents:UIControlEventEditingDidEndOnExit];
    [stack addArrangedSubview:self.nameField];
    UILabel *commentLabel = [self fieldLabel:@"Commentaire"];
    [stack addArrangedSubview:commentLabel];
    self.commentView = [[UITextView alloc] init];
    self.commentView.font = [UIFont preferredFontForTextStyle:UIFontTextStyleBody];
    self.commentView.backgroundColor = UIColor.whiteColor;
    self.commentView.textColor = UIColor.blackColor;
    self.commentView.keyboardAppearance = UIKeyboardAppearanceLight;
    self.commentView.layer.borderColor = [UIColor colorWithRed:0.88 green:0.90 blue:0.93 alpha:1].CGColor;
    self.commentView.layer.borderWidth = 1;
    self.commentView.layer.cornerRadius = 10;
    self.commentView.textContainerInset = UIEdgeInsetsMake(12,8,12,8);
    self.commentView.editable = NO;
    [self.commentView.heightAnchor constraintEqualToConstant:88].active = YES;
    [stack addArrangedSubview:self.commentView];
    UILabel *collectionLabel = [self fieldLabel:@"Collection *"];
    [stack addArrangedSubview:collectionLabel];
    self.collectionButton = [self selectionButton:@"Choisir une collection…" action:@selector(chooseCollection)];
    [stack addArrangedSubview:self.collectionButton];
    UILabel *categoryLabel = [self fieldLabel:@"Catégorie"];
    [stack addArrangedSubview:categoryLabel];
    self.categoryButton = [self selectionButton:@"Choisir une catégorie…" action:@selector(chooseCategory)];
    [stack addArrangedSubview:self.categoryButton];
    [self refreshSelectionButtons];
    UIStackView *buttons = [[UIStackView alloc] init];
    buttons.axis = UILayoutConstraintAxisHorizontal;
    buttons.spacing = 12;
    buttons.distribution = UIStackViewDistributionFillEqually;
    UIButton *cancel = [UIButton buttonWithType:UIButtonTypeSystem];
    [cancel setTitle:@"Annuler" forState:UIControlStateNormal];
    [cancel addTarget:self action:@selector(cancel) forControlEvents:UIControlEventTouchUpInside];
    cancel.backgroundColor = UIColor.whiteColor;
    cancel.layer.cornerRadius = 10;
    cancel.layer.borderWidth = 1;
    cancel.layer.borderColor = [UIColor colorWithRed:0.86 green:0.89 blue:0.91 alpha:1].CGColor;
    [cancel.heightAnchor constraintGreaterThanOrEqualToConstant:48].active = YES;
    [buttons addArrangedSubview:cancel];
    self.saveButton = [UIButton buttonWithType:UIButtonTypeSystem];
    [self.saveButton setTitle:@"Enregistrer" forState:UIControlStateNormal];
    self.saveButton.titleLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleHeadline];
    self.saveButton.backgroundColor = [UIColor colorWithRed:0.22 green:0.49 blue:0.45 alpha:1];
    [self.saveButton setTitleColor:UIColor.whiteColor forState:UIControlStateNormal];
    self.saveButton.layer.cornerRadius = 10;
    self.saveButton.enabled = NO;
    [self.saveButton addTarget:self action:@selector(save) forControlEvents:UIControlEventTouchUpInside];
    [buttons addArrangedSubview:self.saveButton];
    [stack addArrangedSubview:buttons];
    self.preferredContentSize = CGSizeMake(0, 660);
}

- (void)dismissKeyboard { [self.view endEditing:YES]; }

- (void)keyboardWillChange:(NSNotification *)notification {
    CGRect keyboard = [notification.userInfo[UIKeyboardFrameEndUserInfoKey] CGRectValue];
    CGRect local = [self.view convertRect:keyboard fromView:nil];
    CGFloat overlap = MAX(0, CGRectGetMaxY(self.view.bounds) - CGRectGetMinY(local));
    self.scrollBottomConstraint.constant = -overlap;
    [self animateKeyboard:notification];
}

- (void)keyboardWillHide:(NSNotification *)notification {
    self.scrollBottomConstraint.constant = 0;
    [self animateKeyboard:notification];
}

- (void)animateKeyboard:(NSNotification *)notification {
    NSTimeInterval duration = [notification.userInfo[UIKeyboardAnimationDurationUserInfoKey] doubleValue];
    [UIView animateWithDuration:duration animations:^{ [self.view layoutIfNeeded]; }];
}

- (void)loadSharedContent {
    NSArray *inputItems = self.extensionContext.inputItems;
    if (inputItems.count == 0) {
        [self showError:@"Aucune donnée n’a été fournie par l’application source."];
        return;
    }
    dispatch_group_t group = dispatch_group_create();
    for (id object in inputItems) {
        if (![object isKindOfClass:NSExtensionItem.class]) continue;
        NSExtensionItem *item = object;
        if (item.attributedTitle.string.length) [self.sharedTexts addObject:item.attributedTitle.string];
        if (item.attributedContentText.string.length) [self.sharedTexts addObject:item.attributedContentText.string];
        for (NSItemProvider *provider in item.attachments ?: @[]) {
            if (provider.suggestedName.length && ![provider.suggestedName containsString:@"://"]) {
                [self.sharedTexts addObject:provider.suggestedName];
            }
            [self loadType:UTTypeURL.identifier provider:provider group:group];
            [self loadType:UTTypeText.identifier provider:provider group:group];
        }
    }
    dispatch_group_notify(group, dispatch_get_main_queue(), ^{ [self finishLoading]; });
}

- (void)loadType:(NSString *)type provider:(NSItemProvider *)provider group:(dispatch_group_t)group {
    if (![provider hasItemConformingToTypeIdentifier:type]) return;
    dispatch_group_enter(group);
    [provider loadItemForTypeIdentifier:type options:nil completionHandler:^(id<NSSecureCoding> value, NSError *error) {
        if (!error && value) {
            id object = (id)value;
            @synchronized (self) {
                if ([object isKindOfClass:NSURL.class]) {
                    NSString *candidate = [(NSURL *)object absoluteString];
                    if (!self.sharedURL.length && [self isSupportedMapsURL:candidate]) self.sharedURL = candidate;
                } else if ([object isKindOfClass:NSString.class]) {
                    NSString *text = (NSString *)object;
                    if (text.length) [self.sharedTexts addObject:text];
                    NSString *candidate = [self firstSupportedURLInText:text];
                    if (!self.sharedURL.length && candidate.length) self.sharedURL = candidate;
                }
            }
        }
        dispatch_group_leave(group);
    }];
}

- (BOOL)isSupportedMapsURL:(NSString *)value {
    NSURL *url = [NSURL URLWithString:value ?: @""];
    if (![url.scheme.lowercaseString isEqualToString:@"https"]) return NO;
    NSString *host = url.host.lowercaseString ?: @"";
    return [host isEqualToString:@"maps.apple"] || [host isEqualToString:@"maps.apple.com"] || [host isEqualToString:@"www.maps.apple.com"] ||
        [host isEqualToString:@"maps.app.goo.gl"] || [host isEqualToString:@"goo.gl"] ||
        [@[@"google.com",@"www.google.com",@"maps.google.com",@"google.co.jp",@"www.google.co.jp",@"maps.google.co.jp"] containsObject:host];
}

- (NSString *)firstSupportedURLInText:(NSString *)text {
    if (!text.length) return nil;
    NSDataDetector *detector = [NSDataDetector dataDetectorWithTypes:NSTextCheckingTypeLink error:nil];
    for (NSTextCheckingResult *match in [detector matchesInString:text options:0 range:NSMakeRange(0, text.length)]) {
        NSString *candidate = match.URL.absoluteString;
        if ([self isSupportedMapsURL:candidate]) return candidate;
    }
    return nil;
}

- (NSString *)prefilledName {
    for (NSString *text in self.sharedTexts) {
        for (NSString *line in [text componentsSeparatedByCharactersInSet:NSCharacterSet.newlineCharacterSet]) {
            NSString *trimmed = [line stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
            if (trimmed.length && ![trimmed containsString:@"://"] && trimmed.length <= 160 && ![trimmed.lowercaseString hasPrefix:@"http"] && ![trimmed.lowercaseString hasPrefix:@"maps.apple"] && ![trimmed.lowercaseString hasPrefix:@"google.com"]) return trimmed;
        }
    }
    NSURLComponents *components = [NSURLComponents componentsWithString:self.sharedURL];
    for (NSURLQueryItem *item in components.queryItems ?: @[]) {
        if (([@[@"name",@"q",@"query",@"title",@"place"] containsObject:item.name.lowercaseString]) && item.value.length) {
            NSRegularExpression *coordinates = [NSRegularExpression regularExpressionWithPattern:@"^-?[0-9.]+\\s*,\\s*-?[0-9.]+$" options:0 error:nil];
            if ([coordinates numberOfMatchesInString:item.value options:0 range:NSMakeRange(0, item.value.length)] == 0) return item.value;
        }
    }
    NSArray *parts = components.URL.path.pathComponents;
    NSUInteger placeIndex = [parts indexOfObject:@"place"];
    if (placeIndex != NSNotFound && placeIndex + 1 < parts.count) return [parts[placeIndex + 1] stringByReplacingOccurrencesOfString:@"+" withString:@" "];
    // Apple Plans sometimes shares a /place?address=... URL without a name.
    // Keep the address as an editable fallback rather than leaving the form blank.
    for (NSURLQueryItem *item in components.queryItems ?: @[]) {
        if ([item.name isEqualToString:@"address"] && item.value.length) {
            return [item.value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
        }
    }
    return @"";
}

- (void)finishLoading {
    if (!self.sharedURL.length) {
        [self showError:@"Le partage ne contient aucun lien Apple Plans ou Google Maps exploitable."];
        return;
    }
    [self.activityIndicator stopAnimating];
    self.activityIndicator.hidden = YES;
    self.statusLabel.text = @"Vérifiez les informations avant l’enregistrement.";
    self.urlLabel.text = self.sharedURL;
    self.urlLabel.hidden = NO;
    self.nameField.text = [self prefilledName];
    [self resolveSharedName];
    self.nameField.enabled = YES;
    self.commentView.editable = YES;
    [self refreshSelectionButtons];
    self.saveButton.enabled = YES;
}

// Apple Plans often shares /place?address=...&coordinate=... without
// the actual venue name. Parse the public place page metadata as a
// best-effort enhancement; never overwrite a name manually edited by user.
- (NSString *)nameFromApplePage:(NSData *)data {
    if (!data.length || data.length > 2 * 1024 * 1024) return nil;
    NSString *html = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    if (!html.length) return nil;
    NSRegularExpression *tags = [NSRegularExpression regularExpressionWithPattern:@"<meta[^>]*>"
        options:NSRegularExpressionCaseInsensitive error:nil];
    NSRegularExpression *content = [NSRegularExpression regularExpressionWithPattern:@"content\\s*=\\s*[\"']([^\"']+)"
        options:NSRegularExpressionCaseInsensitive error:nil];
    NSString *candidate = nil;
    for (NSTextCheckingResult *match in [tags matchesInString:html options:0 range:NSMakeRange(0, html.length)]) {
        NSString *tag = [html substringWithRange:match.range];
        if ([tag rangeOfString:@"og:title" options:NSCaseInsensitiveSearch].location == NSNotFound &&
            [tag rangeOfString:@"twitter:title" options:NSCaseInsensitiveSearch].location == NSNotFound) continue;
        NSTextCheckingResult *value = [content firstMatchInString:tag options:0 range:NSMakeRange(0, tag.length)];
        if (value.numberOfRanges > 1) { candidate = [tag substringWithRange:[value rangeAtIndex:1]]; break; }
    }
    if (!candidate.length) {
        NSRegularExpression *title = [NSRegularExpression regularExpressionWithPattern:@"<title[^>]*>([^<]+)</title>"
            options:NSRegularExpressionCaseInsensitive error:nil];
        NSTextCheckingResult *value = [title firstMatchInString:html options:0 range:NSMakeRange(0, html.length)];
        if (value.numberOfRanges > 1) candidate = [html substringWithRange:[value rangeAtIndex:1]];
    }
    if (!candidate.length) return nil;
    NSDictionary *entities = @{@"&amp;":@"&", @"&quot;":@"\"", @"&#39;":@"'", @"&lt;":@"<", @"&gt;":@">"};
    for (NSString *key in entities) candidate = [candidate stringByReplacingOccurrencesOfString:key withString:entities[key]];
    for (NSString *suffix in @[@" - Apple Maps", @" | Apple Maps", @" on Apple Maps", @" – Apple Maps"]) {
        if ([candidate hasSuffix:suffix]) candidate = [candidate substringToIndex:candidate.length - suffix.length];
    }
    candidate = [candidate stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (!candidate.length || candidate.length > 160 ||
        [@[@"Maps", @"Apple Maps", @"Google Maps"] containsObject:candidate]) return nil;
    return candidate;
}

- (void)resolveSharedName {
    NSURL *url = [NSURL URLWithString:self.sharedURL];
    NSString *host = url.host.lowercaseString ?: @"";
    BOOL apple = [@[@"maps.apple", @"maps.apple.com", @"www.maps.apple.com"] containsObject:host];
    BOOL google = [host isEqualToString:@"maps.app.goo.gl"] || [host isEqualToString:@"goo.gl"];
    if (!apple && !google) return;
    NSString *originalName = self.nameField.text ?: @"";
    NSURLSessionConfiguration *configuration = NSURLSessionConfiguration.ephemeralSessionConfiguration;
    configuration.timeoutIntervalForResource = 18;
    NSURLSession *session = [NSURLSession sessionWithConfiguration:configuration];
    [[session dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
        NSURLComponents *components = [NSURLComponents componentsWithURL:response.URL resolvingAgainstBaseURL:NO];
        NSString *finalHost = components.host.lowercaseString ?: @"";
        BOOL trusted = (apple && [@[@"maps.apple", @"maps.apple.com", @"www.maps.apple.com"] containsObject:finalHost]) ||
            (google && ([@[@"www.google.com", @"google.com", @"maps.google.com", @"www.google.co.jp", @"google.co.jp", @"maps.google.co.jp"] containsObject:finalHost]));
        NSString *resolvedName = nil;
        if (trusted) {
            for (NSURLQueryItem *item in components.queryItems) {
                NSString *key = item.name.lowercaseString;
                if ([@[@"name",@"title",@"q",@"query"] containsObject:key] && item.value.length) {
                    resolvedName = (google && [@[@"q",@"query"] containsObject:key])
                        ? [[item.value componentsSeparatedByString:@","] firstObject] : item.value;
                    break;
                }
            }
            if (!resolvedName.length && apple) resolvedName = [self nameFromApplePage:data];
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            if (!error && trusted && resolvedName.length && [self.nameField.text isEqualToString:originalName]) {
                self.nameField.text = resolvedName;
                if (apple) self.sharedURL = components.URL.absoluteString;
                self.urlLabel.text = self.sharedURL;
            }
        });
        [session finishTasksAndInvalidate];
    }] resume];
}

- (void)showError:(NSString *)message {
    [self.activityIndicator stopAnimating];
    self.activityIndicator.hidden = YES;
    self.statusLabel.textColor = UIColor.systemRedColor;
    self.statusLabel.text = message;
    self.saveButton.enabled = NO;
}


- (void)cancel {
    self.validationGeneration++;
    NSError *error = [NSError errorWithDomain:@"fr.cowprod.nearbyplaces.share" code:NSUserCancelledError userInfo:nil];
    [self.extensionContext cancelRequestWithError:error];
}

- (void)save {
    if (!self.selectedCollection) {
        [self chooseCollection];
        return;
    }
    if (![self.nameField.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet].length) {
        self.statusLabel.text = @"Le nom du lieu est obligatoire.";
        [self.nameField becomeFirstResponder]; return;
    }
    self.saveButton.enabled = NO;
    self.statusLabel.textColor = UIColor.secondaryLabelColor;
    self.statusLabel.text = @"Vérification du lieu et de ses coordonnées…";
    [self.activityIndicator startAnimating];
    self.activityIndicator.hidden = NO;
    [self.view endEditing:YES];
    NearbyMapsResolver *resolver = [[NearbyMapsResolver alloc] init];
    NSUInteger generation = ++self.validationGeneration;
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 45 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        if (self.validationGeneration != generation) return;
        self.validationGeneration++;
        [self showError:@"La vérification prend trop de temps. Vos informations sont conservées dans ce formulaire ; réessayez."];
        self.saveButton.enabled = YES;
    });
    [resolver resolveURL:self.sharedURL completion:^(NSDictionary *result, NSString *error) {
        dispatch_async(dispatch_get_main_queue(), ^{
            if (self.validationGeneration != generation) return;
            self.validationGeneration++;
            [self.activityIndicator stopAnimating];
            self.activityIndicator.hidden = YES;
            NSString *validated = [NearbyMapsResolver validatedPlaceURL:result[@"htmlMapURL"] ?: result[@"url"]];
            if (error || !validated) {
                [self showError:error ?: @"Les coordonnées du lieu sont introuvables. Rien n’a été enregistré."];
                self.saveButton.enabled = YES;
                return;
            }
            self.sharedURL = validated;
            [self persistResolvedPlace];
        });
    }];
}

- (void)persistResolvedPlace {
    NSString *name = [self.nameField.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (!name.length) {
        self.statusLabel.textColor = UIColor.systemRedColor;
        self.statusLabel.text = @"Le nom du lieu est obligatoire.";
        [self.nameField becomeFirstResponder];
        return;
    }
    if (!self.sharedURL.length) { [self showError:@"Le lien du lieu est manquant."]; return; }
    NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:NearbyAppGroup];
    if (!defaults) { [self showError:@"Le stockage partagé Nearby Places est indisponible."]; return; }
    id storedQueue = [defaults objectForKey:NearbyQueueKey];
    if (storedQueue && ![storedQueue isKindOfClass:NSArray.class]) {
        [self showError:@"La file d’import partagée est illisible. Aucun élément n’a été écrasé."];
        return;
    }
    NSMutableArray *queue = storedQueue ? [(NSArray *)storedQueue mutableCopy] : [NSMutableArray array];
    if (queue.count >= NearbyQueueLimit) {
        [self showError:@"La file d’import est pleine. Ouvrez Nearby Places avant de réessayer."];
        return;
    }
    NSDictionary *collection = self.selectedCollection;
    NSDictionary *category = self.selectedCategory;
    if (!category && [self categoriesForSelectedCollection].count) category = [self categoriesForSelectedCollection].firstObject;
    if (![collection[@"id"] isKindOfClass:NSString.class] || [collection[@"id"] length] == 0) {
        [self showError:self.collections.count < 2 ? @"Aucune collection disponible. Ouvrez Nearby Places, créez une collection puis réessayez le partage." : @"Choisissez une collection avant d’enregistrer ce lieu."];
        return;
    }
    NSDictionary *record = @{
        @"schemaVersion": @1,
        @"shareID": NSUUID.UUID.UUIDString,
        @"createdAt": @([NSDate.date timeIntervalSince1970]),
        @"nearbyName": name,
        @"nearbyComment": [self.commentView.text stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] ?: @"",
        @"nearbyCategory": category[@"id"] ?: @"culture",
        @"nearbyCollection": collection[@"id"] ?: @"",
        @"nearbyURL": self.sharedURL,
        @"rawText": [self.sharedTexts componentsJoinedByString:@"\n"] ?: @""
    };
    NSError *writeError = nil;
    NSURL *container = [NSFileManager.defaultManager containerURLForSecurityApplicationGroupIdentifier:NearbyAppGroup];
    if (!container) {
        [self showError:@"Le conteneur App Group est inaccessible. Vérifiez la signature de l’extension."];
        return;
    }
    NSURL *directory = [container URLByAppendingPathComponent:@"NearbyShares" isDirectory:YES];
    BOOL created = [NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:&writeError];
    NSArray *pendingFiles = created ? [NSFileManager.defaultManager contentsOfDirectoryAtURL:directory includingPropertiesForKeys:nil options:0 error:&writeError] : nil;
    if (pendingFiles.count >= NearbyQueueLimit) {
        [self showError:@"La file d’import est pleine. Ouvrez Nearby Places avant de réessayer."];
        return;
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:record options:0 error:&writeError];
    NSURL *file = [directory URLByAppendingPathComponent:[record[@"shareID"] stringByAppendingPathExtension:@"json"]];
    if (!created || !pendingFiles || !data || ![data writeToURL:file options:NSDataWritingAtomic error:&writeError]) {
        [self showError:[NSString stringWithFormat:@"Enregistrement impossible : %@", writeError.localizedDescription ?: @"stockage indisponible"]];
        return;
    }
    self.saveButton.enabled = NO;
    [self.view endEditing:YES];
    UIAlertController *confirmation = [UIAlertController alertControllerWithTitle:@"Lieu vérifié et sauvegardé"
        message:[NSString stringWithFormat:@"Les coordonnées sont vérifiées. Le lieu sera ajouté à « %@ » à la prochaine ouverture de Nearby Places.", collection[@"name"] ?: @"la collection sélectionnée"]
        preferredStyle:UIAlertControllerStyleAlert];
    [confirmation addAction:[UIAlertAction actionWithTitle:@"Fermer" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action) {
        [self.extensionContext completeRequestReturningItems:@[] completionHandler:nil];
    }]];
    [self presentViewController:confirmation animated:YES completion:nil];
}

- (UIButton *)selectionButton:(NSString *)title action:(SEL)action {
    UIButton *button = [UIButton buttonWithType:UIButtonTypeSystem];
    button.contentHorizontalAlignment = UIControlContentHorizontalAlignmentLeft;
    button.titleLabel.font = [UIFont preferredFontForTextStyle:UIFontTextStyleBody];
    button.titleEdgeInsets = UIEdgeInsetsMake(0, 14, 0, 14);
    [button setTitle:title forState:UIControlStateNormal];
    [button setTitleColor:[UIColor colorWithRed:0.18 green:0.24 blue:0.28 alpha:1] forState:UIControlStateNormal];
    button.backgroundColor = UIColor.whiteColor;
    button.layer.cornerRadius = 10;
    button.layer.borderWidth = 1;
    button.layer.borderColor = [UIColor colorWithRed:0.88 green:0.90 blue:0.93 alpha:1].CGColor;
    [button.heightAnchor constraintGreaterThanOrEqualToConstant:48].active = YES;
    [button addTarget:self action:action forControlEvents:UIControlEventTouchUpInside];
    return button;
}

- (NSArray<NSDictionary *> *)categoriesForSelectedCollection {
    NSString *collectionId = [self.selectedCollection[@"id"] isKindOfClass:NSString.class] ? self.selectedCollection[@"id"] : @"";
    NSMutableArray *result = [NSMutableArray array];
    for (NSDictionary *category in self.categories) {
        NSString *scope = [category[@"collectionId"] isKindOfClass:NSString.class] ? category[@"collectionId"] : @"";
        if (!scope.length || [scope isEqualToString:collectionId]) [result addObject:category];
    }
    return result;
}

- (void)refreshSelectionButtons {
    NSString *collectionName = self.selectedCollection[@"name"];
    NSString *categoryName = self.selectedCategory[@"name"];
    [self.collectionButton setTitle:collectionName.length ? collectionName : @"Choisir une collection…" forState:UIControlStateNormal];
    [self.categoryButton setTitle:categoryName.length ? categoryName : @"Choisir une catégorie…" forState:UIControlStateNormal];
    // Real tappable buttons open a familiar native selection sheet, not a
    // context menu whose entries can appear empty in a Share extension.
    self.collectionButton.showsMenuAsPrimaryAction = NO;
    self.categoryButton.showsMenuAsPrimaryAction = NO;
    self.collectionButton.menu = nil;
    self.categoryButton.menu = nil;
    self.collectionButton.enabled = YES;
    self.categoryButton.enabled = self.selectedCollection != nil;
}

- (void)showOptions:(NSArray<NSDictionary *> *)options title:(NSString *)title
              from:(UIButton *)source onChoose:(void (^)(NSDictionary *))onChoose {
    UIAlertController *sheet = [UIAlertController alertControllerWithTitle:title
        message:nil preferredStyle:UIAlertControllerStyleActionSheet];
    NSUInteger choices = 0;
    for (NSDictionary *choice in options) {
        NSString *identifier = [choice[@"id"] isKindOfClass:NSString.class] ? choice[@"id"] : @"";
        NSString *name = [choice[@"name"] isKindOfClass:NSString.class] ? choice[@"name"] : @"";
        if (!identifier.length || !name.length) continue;
        choices++;
        [sheet addAction:[UIAlertAction actionWithTitle:name style:UIAlertActionStyleDefault
            handler:^(__unused UIAlertAction *action) { onChoose(choice); }]];
    }
    if (!choices) {
        [sheet addAction:[UIAlertAction actionWithTitle:@"Aucun choix disponible" style:UIAlertActionStyleDefault handler:nil]];
    }
    [sheet addAction:[UIAlertAction actionWithTitle:@"Annuler" style:UIAlertActionStyleCancel handler:nil]];
    UIPopoverPresentationController *popover = sheet.popoverPresentationController;
    if (popover) { popover.sourceView = source; popover.sourceRect = source.bounds; }
    [self presentViewController:sheet animated:YES completion:nil];
}

- (void)chooseCollection {
    self.collections = [self loadCollections];
    [self showOptions:self.collections title:@"Collection" from:self.collectionButton
            onChoose:^(NSDictionary *choice) {
        self.selectedCollection = choice;
        self.selectedCategory = nil;
        self.categories = [self loadCategories];
        NSArray *available = [self categoriesForSelectedCollection];
        if (available.count == 1) self.selectedCategory = available.firstObject;
        [self refreshSelectionButtons];
    }];
}

- (void)chooseCategory {
    if (!self.selectedCollection) { [self chooseCollection]; return; }
    self.categories = [self loadCategories];
    [self showOptions:[self categoriesForSelectedCollection] title:@"Catégorie"
        from:self.categoryButton onChoose:^(NSDictionary *choice) {
        self.selectedCategory = choice;
        [self refreshSelectionButtons];
    }];
}

@end
